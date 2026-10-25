import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { contact, entreprise, facture, ligneFacture, paiement, utilisateur } from "@/db/schema";
import { genererNumeroFacture } from "@/lib/facturation/numerotation";
import { genererEcrituresFactureEmise, genererEcrituresPaiement } from "@/lib/comptabilite/ecritures";
import { moyenPaiementDepuisOperateur } from "@/lib/aangaraa/utilitaires";
import { obtenirOuCreerLien } from "@/lib/client-documents/liens";
import { adressesAAlerter } from "@/lib/notifications/equipe";
import { verifierDateNonVerrouillee } from "@/lib/comptabilite/verrouillage";

/**
 * Corps accepté par `POST /api/externe/factures` : un site connecté vient d'encaisser un paiement (Mobile Money confirmé de son côté) et
 * demande à Vertex One d'émettre la facture PAYÉE correspondante. Vertex One reste la seule source de numérotation et de comptabilité :
 * le site n'invente jamais un numéro de facture. Tout est borné, jamais de confiance dans la taille ni le contenu.
 */
export const schemaFactureExterne = z.object({
  source: z.string().trim().min(1).max(80).default("Site web"),
  // Clé d'idempotence côté site (ex. l'identifiant de la demande payée) : un renvoi de la même référence ne crée JAMAIS une seconde facture.
  reference: z.string().trim().min(1, "La référence du paiement est requise.").max(120),
  client: z.object({
    nom: z.string().trim().min(2, "Le nom du client est requis (2 caractères minimum).").max(120),
    email: z.union([z.literal(""), z.string().trim().email("Adresse email invalide.").max(160)]).optional(),
    telephone: z.string().trim().max(40).optional(),
  }),
  designation: z.string().trim().min(2, "La désignation est requise.").max(255),
  // Montant TOUT COMPRIS réellement payé par le client, en FCFA (entier). Vertex One en déduit la TVA selon les réglages de l'entreprise.
  montantTTC: z.number().int("Le montant doit être un entier (FCFA).").min(100, "Montant trop faible.").max(100_000_000, "Montant trop élevé."),
  // Opérateur renvoyé par le prestataire de paiement (« MTN_Cameroon », « Orange_Cameroon »…) : sert à ranger le règlement.
  operateur: z.string().trim().max(60).optional(),
  // Date du paiement (ISO 8601) ; absente = maintenant. Jamais dans le futur.
  payeLe: z.string().datetime({ offset: true }).optional(),
});

export type FactureExterne = z.infer<typeof schemaFactureExterne>;

/** Taux de TVA appliqué par Vertex One aux entreprises assujetties (même valeur que dans tout le module Facturation). */
export const TAUX_TVA = 19.25;

export type ResultatFactureExterne =
  | {
      doublon: boolean;
      factureId: string;
      numero: string;
      jeton: string;
      contactId: string;
      nomClient: string;
      emailClient: string | null;
      montantTTC: number;
      operateur: string | undefined;
      adresses: string[];
    }
  | { erreur: "AUCUN_ADMIN" };

/** Clé sous laquelle le règlement porte la référence du site : sert d'idempotence, et reste lisible dans la fiche de la facture. */
export function referenceReglementExterne(source: string, reference: string): string {
  return `ext:${source}:${reference}`;
}

/** Partage un montant TTC en HT + TVA selon l'entreprise (assujettie ou non) ; HT + TVA = TTC exactement, jamais un FCFA de décalage. */
export function ventilerMontantTTC(montantTTC: number, assujettiTVA: boolean): { montantHT: number; montantTVA: number; tauxTVA: number } {
  if (!assujettiTVA) return { montantHT: montantTTC, montantTVA: 0, tauxTVA: 0 };
  const montantHT = Math.round(montantTTC / (1 + TAUX_TVA / 100));
  return { montantHT, montantTVA: montantTTC - montantHT, tauxTVA: TAUX_TVA };
}

/**
 * Retrouve (ou crée) le Contact du client, SANS jamais écraser une fiche existante : par email d'abord, puis par les 9 derniers chiffres
 * du téléphone (avec ou sans +237). `utilisateur`/`contact` sont lus avec l'entreprise explicitement filtrée en plus de la RLS.
 */
async function trouverOuCreerContact(tx: TransactionDrizzle, entrepriseId: string, client: FactureExterne["client"], assigneAId: string): Promise<string> {
  const email = client.email?.trim().toLowerCase() || null;
  if (email) {
    const [parEmail] = await tx
      .select({ id: contact.id })
      .from(contact)
      .where(and(eq(contact.entrepriseId, entrepriseId), sql`lower(${contact.email}) = ${email}`))
      .orderBy(asc(contact.creeLe))
      .limit(1);
    if (parEmail) return parEmail.id;
  }

  const chiffres = (client.telephone ?? "").replace(/\D/g, "");
  if (chiffres.length >= 9) {
    const fin = chiffres.slice(-9);
    const [parTelephone] = await tx
      .select({ id: contact.id })
      .from(contact)
      .where(and(eq(contact.entrepriseId, entrepriseId), sql`right(regexp_replace(${contact.telephone}, '[^0-9]', '', 'g'), 9) = ${fin}`))
      .orderBy(asc(contact.creeLe))
      .limit(1);
    if (parTelephone) return parTelephone.id;
  }

  const [cree] = await tx
    .insert(contact)
    .values({ entrepriseId, nom: client.nom, email, telephone: client.telephone?.trim() || "Non renseigné", assigneAId, notes: "Créé automatiquement à partir d'un paiement reçu sur un site connecté." })
    .returning({ id: contact.id });
  return cree.id;
}

/**
 * Émet la facture PAYÉE d'un paiement fait sur un site connecté, dans l'entreprise de la clé (la transaction `tx` est déjà ouverte sous
 * la RLS de CETTE entreprise) : contact, numéro (atomique, sans trou), ligne, règlement et écritures comptables (facture émise puis
 * règlement), comme pour toute facture payée dans Vertex One.
 *
 * Idempotent par (source, référence) : un verrou consultatif de la transaction sérialise deux appels simultanés pour la même référence,
 * puis le second retrouve la facture du premier — jamais deux factures pour un même paiement (une facture n'est jamais supprimable).
 */
export async function creerFactureExterne(tx: TransactionDrizzle, entrepriseId: string, donnees: FactureExterne): Promise<ResultatFactureExterne> {
  const cleReglement = referenceReglementExterne(donnees.source, donnees.reference);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${entrepriseId}:${cleReglement}`}))`);

  const [deja] = await tx
    .select({ factureId: paiement.factureId, montant: paiement.montant })
    .from(paiement)
    .where(and(eq(paiement.entrepriseId, entrepriseId), eq(paiement.referenceTransaction, cleReglement)))
    .limit(1);
  if (deja) {
    const [f] = await tx.select({ id: facture.id, numero: facture.numero, contactId: facture.contactId }).from(facture).where(eq(facture.id, deja.factureId));
    const [c] = await tx.select({ nom: contact.nom, email: contact.email }).from(contact).where(eq(contact.id, f.contactId));
    return {
      doublon: true,
      factureId: f.id,
      numero: f.numero,
      jeton: await obtenirOuCreerLien(tx, entrepriseId, { factureId: f.id }),
      contactId: f.contactId,
      nomClient: c?.nom ?? donnees.client.nom,
      emailClient: c?.email ?? null,
      montantTTC: deja.montant,
      operateur: donnees.operateur,
      adresses: [],
    };
  }

  const [admin] = await tx
    .select({ id: utilisateur.id })
    .from(utilisateur)
    .where(and(eq(utilisateur.entrepriseId, entrepriseId), eq(utilisateur.role, "ADMIN"), eq(utilisateur.statut, "ACTIF")))
    .orderBy(asc(utilisateur.creeLe))
    .limit(1);
  if (!admin) return { erreur: "AUCUN_ADMIN" };

  const [monEntreprise] = await tx
    .select({ assujettiTVA: entreprise.assujettiTVA, dateVerrouillageComptable: entreprise.dateVerrouillageComptable })
    .from(entreprise)
    .where(eq(entreprise.id, entrepriseId));
  const { montantHT, montantTVA, tauxTVA } = ventilerMontantTTC(donnees.montantTTC, Boolean(monEntreprise?.assujettiTVA));

  const maintenant = new Date();
  let payeLe = donnees.payeLe ? new Date(Math.min(new Date(donnees.payeLe).getTime(), maintenant.getTime())) : maintenant;
  // Période comptable déjà verrouillée : jamais d'écriture dans le passé clos (la transaction échouerait et le paiement resterait sans
  // facture) ; la facture et ses écritures prennent la date du jour, comme toute régularisation tardive.
  if (verifierDateNonVerrouillee(monEntreprise?.dateVerrouillageComptable ?? null, payeLe)) payeLe = maintenant;

  const contactId = await trouverOuCreerContact(tx, entrepriseId, donnees.client, admin.id);
  const [leContact] = await tx.select({ nom: contact.nom, email: contact.email }).from(contact).where(eq(contact.id, contactId));

  const numero = await genererNumeroFacture(tx, entrepriseId);
  const [nouvelle] = await tx
    .insert(facture)
    .values({
      entrepriseId,
      numero,
      contactId,
      assigneAId: admin.id,
      statut: "PAYEE",
      montantHT,
      montantTVA,
      montantTTC: donnees.montantTTC,
      dateEmission: payeLe,
      dateEcheance: payeLe,
      // Le client a payé : la facture est de fait reconnue.
      reponseClient: "ACCEPTEE",
      reponseClientLe: payeLe,
    })
    .returning({ id: facture.id });

  await tx.insert(ligneFacture).values({ entrepriseId, factureId: nouvelle.id, designation: donnees.designation, quantite: 1, prixUnitaire: montantHT, tauxTVA });

  const moyen = moyenPaiementDepuisOperateur(donnees.operateur);
  const [reglement] = await tx
    .insert(paiement)
    .values({ entrepriseId, factureId: nouvelle.id, montant: donnees.montantTTC, moyenPaiement: moyen, referenceTransaction: cleReglement, datePaiement: payeLe })
    .returning({ id: paiement.id });

  await genererEcrituresFactureEmise(tx, { id: nouvelle.id, entrepriseId, numero, dateEmission: payeLe, montantHT, montantTVA, montantTTC: donnees.montantTTC });
  await genererEcrituresPaiement(tx, { entrepriseId, factureId: nouvelle.id, paiementId: reglement.id, numeroFacture: numero, montant: donnees.montantTTC, moyenPaiement: moyen, datePaiement: payeLe });

  return {
    doublon: false,
    factureId: nouvelle.id,
    numero,
    jeton: await obtenirOuCreerLien(tx, entrepriseId, { factureId: nouvelle.id }),
    contactId,
    nomClient: leContact?.nom ?? donnees.client.nom,
    emailClient: leContact?.email?.trim() || null,
    montantTTC: donnees.montantTTC,
    operateur: donnees.operateur,
    adresses: await adressesAAlerter(tx, entrepriseId),
  };
}

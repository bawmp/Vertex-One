import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import {
  devis,
  ligneDevis,
  facture,
  ligneFacture,
  bonCommandeVente,
  ligneBonCommandeVente,
  recuVente,
  ligneRecuVente,
  factureAcompte,
  contact,
  compteClient,
  entreprise,
} from "@/db/schema";
import { idsVisibles } from "@/lib/portee";
import type { UtilisateurConnecte } from "@/lib/session";
import { urlTelechargementDocument } from "@/lib/documents/stockage";

/** Libellé français fixe, indépendant de la langue de l'interface — voir CLAUDE.md, i18n (les PDF restent en français). */
const LIBELLE_MOYEN_PAIEMENT: Record<string, string> = {
  orange_money: "Orange Money",
  mtn_momo: "MTN MoMo",
  especes: "Espèces",
  virement: "Virement",
  manuel: "Autre",
};

export type ClientPourPDF = { nom: string; societeCliente: string | null; niu: string | null; telephone: string; email: string | null };

/**
 * Construit l'objet "client" attendu par DocumentCommercialPDF à partir du
 * Contact (+ Compte optionnel) directement porté par le document — découplage
 * Books/CRM (échange du 2026-09-07) : ne passe plus par un Deal intermédiaire,
 * contactId/compteId sont désormais lus directement sur le Devis/la Facture.
 * Le NIU vit sur le Compte (donnée de société), pas sur le Contact (donnée
 * de personne).
 */
async function construireClientPourPDF(tx: TransactionDrizzle, contactId: string | null, compteId: string | null): Promise<ClientPourPDF | null> {
  if (!contactId) return null;

  const [leContact] = await tx.select().from(contact).where(eq(contact.id, contactId));
  if (!leContact) return null;

  const [leCompte] = compteId ? await tx.select().from(compteClient).where(eq(compteClient.id, compteId)) : [null];

  return {
    nom: leContact.nom,
    societeCliente: leCompte?.nom ?? null,
    niu: leCompte?.niu ?? null,
    telephone: leContact.telephone,
    email: leContact.email,
  };
}

/**
 * Résout une URL signée fraîche du logo (si téléversé) pour l'en-tête PDF —
 * jamais l'URL publique /logo/[entrepriseId] (le PDF est généré côté
 * serveur, react-pdf récupère l'image lui-même, une URL signée directe vers
 * R2 évite un aller-retour HTTP supplémentaire vers l'app elle-même).
 */
async function avecLogo<T extends { logoCleStockage: string | null }>(monEntreprise: T): Promise<T & { logoUrl: string | null }> {
  const logoUrl = monEntreprise.logoCleStockage ? await urlTelechargementDocument(monEntreprise.logoCleStockage) : null;
  return { ...monEntreprise, logoUrl };
}

/**
 * Extrait de la Route Handler PDF d'origine — réutilisé tel quel par
 * l'action d'envoi par email (elle a besoin exactement des mêmes données
 * pour générer la même pièce jointe), pour éviter de dupliquer la requête
 * et le contrôle de portée (idsVisibles).
 */
export async function recupererDevisPourPDF(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, devisId: string) {
  const [d] = await tx.select().from(devis).where(eq(devis.id, devisId));
  if (!d) return null;

  const visibles = await idsVisibles(tx, utilisateurConnecte, "FACTURATION");
  if (visibles !== "TOUT" && (!d.assigneAId || !visibles.includes(d.assigneAId))) return null;
  const client = await construireClientPourPDF(tx, d.contactId, d.compteId);
  if (!client) return null;

  const [lignes, [monEntreprise]] = await Promise.all([
    tx.select().from(ligneDevis).where(eq(ligneDevis.devisId, devisId)),
    tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
  ]);

  return { devis: d, lignes, client, entreprise: await avecLogo(monEntreprise) };
}

export async function recupererFacturePourPDF(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, factureId: string) {
  const [f] = await tx.select().from(facture).where(eq(facture.id, factureId));
  if (!f) return null;

  const visibles = await idsVisibles(tx, utilisateurConnecte, "FACTURATION");
  if (visibles !== "TOUT" && (!f.assigneAId || !visibles.includes(f.assigneAId))) return null;
  const client = await construireClientPourPDF(tx, f.contactId, f.compteId);
  if (!client) return null;

  const [lignes, [monEntreprise]] = await Promise.all([
    tx.select().from(ligneFacture).where(eq(ligneFacture.factureId, factureId)),
    tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
  ]);

  return { facture: f, lignes, client, entreprise: await avecLogo(monEntreprise) };
}

/**
 * Variantes pour le lien public envoyé au client (2026-09-20) : aucun utilisateur
 * connecté, donc aucun contrôle de portée — l'autorisation est le jeton secret,
 * vérifié par l'appelant, et l'entrepriseId provient de la ligne du lien, jamais
 * du navigateur. À appeler dans avecEntreprise(entrepriseId, ...).
 */
export async function recupererDevisPourClient(tx: TransactionDrizzle, entrepriseId: string, devisId: string) {
  const [d] = await tx.select().from(devis).where(eq(devis.id, devisId));
  if (!d) return null;
  const client = await construireClientPourPDF(tx, d.contactId, d.compteId);
  if (!client) return null;

  const [lignes, [monEntreprise]] = await Promise.all([
    tx.select().from(ligneDevis).where(eq(ligneDevis.devisId, devisId)),
    tx.select().from(entreprise).where(eq(entreprise.id, entrepriseId)),
  ]);

  return { devis: d, lignes, client, entreprise: await avecLogo(monEntreprise) };
}

export async function recupererFacturePourClient(tx: TransactionDrizzle, entrepriseId: string, factureId: string) {
  const [f] = await tx.select().from(facture).where(eq(facture.id, factureId));
  if (!f) return null;
  const client = await construireClientPourPDF(tx, f.contactId, f.compteId);
  if (!client) return null;

  const [lignes, [monEntreprise]] = await Promise.all([
    tx.select().from(ligneFacture).where(eq(ligneFacture.factureId, factureId)),
    tx.select().from(entreprise).where(eq(entreprise.id, entrepriseId)),
  ]);

  return { facture: f, lignes, client, entreprise: await avecLogo(monEntreprise) };
}

/**
 * Bon de commande, Reçu de vente, Facture d'acompte (2026-09-28) — pas de lien
 * public envoyé au client pour ces trois documents (contrairement au devis et
 * à la facture) : uniquement un téléchargement depuis l'application, donc
 * toujours avec un utilisateur connecté et sa portée FACTURATION.
 */
export async function recupererBonCommandeVentePourPDF(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, bonCommandeVenteId: string) {
  const [bc] = await tx.select().from(bonCommandeVente).where(eq(bonCommandeVente.id, bonCommandeVenteId));
  if (!bc) return null;

  const visibles = await idsVisibles(tx, utilisateurConnecte, "FACTURATION");
  if (visibles !== "TOUT" && (!bc.assigneAId || !visibles.includes(bc.assigneAId))) return null;
  const client = await construireClientPourPDF(tx, bc.contactId, bc.compteId);
  if (!client) return null;

  const [lignes, [monEntreprise]] = await Promise.all([
    tx.select().from(ligneBonCommandeVente).where(eq(ligneBonCommandeVente.bonCommandeVenteId, bonCommandeVenteId)),
    tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
  ]);

  return { bonCommandeVente: bc, lignes, client, entreprise: await avecLogo(monEntreprise) };
}

export async function recupererRecuVentePourPDF(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, recuVenteId: string) {
  const [rv] = await tx.select().from(recuVente).where(eq(recuVente.id, recuVenteId));
  if (!rv) return null;

  const visibles = await idsVisibles(tx, utilisateurConnecte, "FACTURATION");
  if (visibles !== "TOUT" && (!rv.assigneAId || !visibles.includes(rv.assigneAId))) return null;
  const client = await construireClientPourPDF(tx, rv.contactId, rv.compteId);
  if (!client) return null;

  const [lignes, [monEntreprise]] = await Promise.all([
    tx.select().from(ligneRecuVente).where(eq(ligneRecuVente.recuVenteId, recuVenteId)),
    tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
  ]);

  return {
    recuVente: rv,
    lignes,
    client,
    entreprise: await avecLogo(monEntreprise),
    moyenPaiementLibelle: LIBELLE_MOYEN_PAIEMENT[rv.moyenPaiement] ?? rv.moyenPaiement,
  };
}

/** Pas de table de lignes pour une Facture d'acompte : montant forfaitaire, voir src/db/schema.ts. */
export async function recupererFactureAcomptePourPDF(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, factureAcompteId: string) {
  const [fa] = await tx.select().from(factureAcompte).where(eq(factureAcompte.id, factureAcompteId));
  if (!fa) return null;

  const visibles = await idsVisibles(tx, utilisateurConnecte, "FACTURATION");
  if (visibles !== "TOUT" && (!fa.assigneAId || !visibles.includes(fa.assigneAId))) return null;
  const client = await construireClientPourPDF(tx, fa.contactId, fa.compteId);
  if (!client) return null;

  const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

  return {
    factureAcompte: fa,
    client,
    entreprise: await avecLogo(monEntreprise),
    moyenPaiementLibelle: fa.moyenPaiement ? (LIBELLE_MOYEN_PAIEMENT[fa.moyenPaiement] ?? fa.moyenPaiement) : null,
  };
}

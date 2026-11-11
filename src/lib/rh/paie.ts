import { and, desc, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { dossierRH, entreprise, paiementSalaire, prime, utilisateur } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { calculerBulletin, type LigneRetenue } from "@/lib/rh/paie-regles";

/**
 * Enregistre le paiement d'un salaire ET génère le bulletin (même transaction : le bulletin est la ligne créée ici, figée). Le salaire de
 * base vient de la base, jamais du navigateur. Les primes non encore payées du mois (ou de mois antérieurs, saisies en retard) sont
 * incluses et rattachées au paiement. Un seul paiement par collaborateur et par mois.
 * Les erreurs sont des clés françaises (traduites par l'appelant).
 */
export async function enregistrerPaiementSalaire(
  tx: TransactionDrizzle,
  p: { entrepriseId: string; dossierRHId: string; mois: string; datePaiement: string; modePaiement: string; retenues: LigneRetenue[]; payeParId: string }
): Promise<{ ok: true; id: string } | { ok: false; erreur: string }> {
  const [dossier] = await tx.select({ id: dossierRH.id, salaireBase: dossierRH.salaireBase }).from(dossierRH).where(and(eq(dossierRH.id, p.dossierRHId), eq(dossierRH.entrepriseId, p.entrepriseId)));
  if (!dossier) return { ok: false, erreur: m("Dossier RH introuvable.") };
  if (!dossier.salaireBase || dossier.salaireBase <= 0) return { ok: false, erreur: m("Renseignez d'abord le salaire de base de cette personne.") };

  const [dejaPaye] = await tx.select({ id: paiementSalaire.id }).from(paiementSalaire).where(and(eq(paiementSalaire.dossierRHId, p.dossierRHId), eq(paiementSalaire.mois, p.mois)));
  if (dejaPaye) return { ok: false, erreur: m("Le salaire de ce mois est déjà payé : son bulletin existe.") };

  const primesDues = await tx
    .select({ id: prime.id, type: prime.type, montant: prime.montant, motif: prime.motif })
    .from(prime)
    .where(and(eq(prime.dossierRHId, p.dossierRHId), isNull(prime.paiementSalaireId), lte(prime.moisConcerne, p.mois)))
    .orderBy(prime.creeLe);

  const calcul = calculerBulletin(dossier.salaireBase, primesDues.map((x) => x.montant), p.retenues);
  if (calcul.net === null) return { ok: false, erreur: m("Les retenues dépassent le salaire et les primes du mois.") };

  const [cree] = await tx
    .insert(paiementSalaire)
    .values({
      entrepriseId: p.entrepriseId,
      dossierRHId: p.dossierRHId,
      mois: p.mois,
      salaireBase: dossier.salaireBase,
      primes: primesDues.map((x) => ({ type: x.type, montant: x.montant, motif: x.motif })),
      totalPrimes: calcul.totalPrimes,
      retenues: p.retenues,
      totalRetenues: calcul.totalRetenues,
      net: calcul.net,
      datePaiement: p.datePaiement,
      modePaiement: p.modePaiement,
      payeParId: p.payeParId,
    })
    .returning({ id: paiementSalaire.id });

  if (primesDues.length > 0) {
    await tx.update(prime).set({ paiementSalaireId: cree.id }).where(and(inArray(prime.id, primesDues.map((x) => x.id)), isNull(prime.paiementSalaireId)));
  }
  return { ok: true, id: cree.id };
}

/** Primes d'un collaborateur, les plus récentes d'abord. */
export function primesDuDossier(tx: TransactionDrizzle, dossierRHId: string) {
  return tx
    .select({ id: prime.id, type: prime.type, montant: prime.montant, moisConcerne: prime.moisConcerne, motif: prime.motif, paiementSalaireId: prime.paiementSalaireId, creeLe: prime.creeLe })
    .from(prime)
    .where(eq(prime.dossierRHId, dossierRHId))
    .orderBy(desc(prime.moisConcerne), desc(prime.creeLe));
}

/**
 * Bulletins (paiements) d'un collaborateur, le plus récent d'abord. Un brouillon (pas encore envoyé) n'est visible que de l'Administrateur :
 * `seulementEnvoyes` le masque à la personne payée.
 */
export function paiementsDuDossier(tx: TransactionDrizzle, dossierRHId: string, options: { seulementEnvoyes?: boolean } = {}) {
  return tx
    .select({ id: paiementSalaire.id, mois: paiementSalaire.mois, net: paiementSalaire.net, totalPrimes: paiementSalaire.totalPrimes, totalRetenues: paiementSalaire.totalRetenues, retenues: paiementSalaire.retenues, datePaiement: paiementSalaire.datePaiement, modePaiement: paiementSalaire.modePaiement, envoyeLe: paiementSalaire.envoyeLe })
    .from(paiementSalaire)
    .where(and(eq(paiementSalaire.dossierRHId, dossierRHId), options.seulementEnvoyes ? isNotNull(paiementSalaire.envoyeLe) : undefined))
    .orderBy(desc(paiementSalaire.mois));
}

/**
 * Modifie un bulletin TANT QU'IL N'EST PAS ENVOYÉ : date, mode de paiement et retenues (le net est recalculé depuis le salaire et les primes
 * figés à la création). Une fois envoyé, il est figé : la personne l'a reçu.
 */
export async function modifierBulletinBrouillon(
  tx: TransactionDrizzle,
  p: { entrepriseId: string; paiementId: string; datePaiement: string; modePaiement: string; retenues: LigneRetenue[] }
): Promise<{ ok: true; dossierRHId: string } | { ok: false; erreur: string }> {
  const [b] = await tx.select().from(paiementSalaire).where(and(eq(paiementSalaire.id, p.paiementId), eq(paiementSalaire.entrepriseId, p.entrepriseId)));
  if (!b) return { ok: false, erreur: m("Bulletin introuvable.") };
  if (b.envoyeLe) return { ok: false, erreur: m("Ce bulletin a déjà été envoyé : il ne peut plus être modifié.") };
  const calcul = calculerBulletin(b.salaireBase, b.primes.map((x) => x.montant), p.retenues);
  if (calcul.net === null) return { ok: false, erreur: m("Les retenues dépassent le salaire et les primes du mois.") };
  const maj = await tx
    .update(paiementSalaire)
    .set({ datePaiement: p.datePaiement, modePaiement: p.modePaiement, retenues: p.retenues, totalRetenues: calcul.totalRetenues, net: calcul.net })
    .where(and(eq(paiementSalaire.id, p.paiementId), isNull(paiementSalaire.envoyeLe)))
    .returning({ id: paiementSalaire.id });
  if (maj.length === 0) return { ok: false, erreur: m("Ce bulletin a déjà été envoyé : il ne peut plus être modifié.") };
  return { ok: true, dossierRHId: b.dossierRHId };
}

/** Marque le bulletin comme envoyé (horloge de la base, une seule fois : un renvoi garde la date du premier envoi). */
export async function marquerBulletinEnvoye(tx: TransactionDrizzle, entrepriseId: string, paiementId: string): Promise<{ dossierRHId: string } | null> {
  const [maj] = await tx
    .update(paiementSalaire)
    .set({ envoyeLe: sql`coalesce(${paiementSalaire.envoyeLe}, now())` })
    .where(and(eq(paiementSalaire.id, paiementId), eq(paiementSalaire.entrepriseId, entrepriseId)))
    .returning({ dossierRHId: paiementSalaire.dossierRHId });
  return maj ?? null;
}

/** Un bulletin complet avec l'en-tête de l'entreprise et la personne payée (pour le PDF). `null` si le bulletin n'est pas de ce dossier. */
export async function lireBulletin(tx: TransactionDrizzle, dossierRHId: string, paiementId: string) {
  const [ligne] = await tx
    .select({
      paiement: paiementSalaire,
      nomComplet: utilisateur.nomComplet,
      email: utilisateur.email,
      utilisateurId: dossierRH.utilisateurId,
      poste: dossierRH.poste,
      dateEmbauche: dossierRH.dateEmbauche,
      entrepriseNom: entreprise.nom,
      adresse: entreprise.adresse,
      ville: entreprise.ville,
      niu: entreprise.niu,
      rccm: entreprise.rccm,
      couleurMarque: entreprise.couleurMarque,
      logoCleStockage: entreprise.logoCleStockage,
      logoTypeMime: entreprise.logoTypeMime,
      filigraneDocuments: entreprise.filigraneDocuments,
    })
    .from(paiementSalaire)
    .innerJoin(dossierRH, eq(paiementSalaire.dossierRHId, dossierRH.id))
    .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
    .innerJoin(entreprise, eq(paiementSalaire.entrepriseId, entreprise.id))
    .where(and(eq(paiementSalaire.id, paiementId), eq(paiementSalaire.dossierRHId, dossierRHId)));
  return ligne ?? null;
}

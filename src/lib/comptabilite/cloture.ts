import { and, desc, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { clotureExercice, compteComptable, ecritureComptable, entreprise, journalManuel, reouvertureExercice } from "@/db/schema";
import { genererNumeroJournalManuel } from "@/lib/facturation/numerotation";
import { verifierDateNonVerrouillee } from "./verrouillage";
import { contrePasserEcritures } from "./contre-passation";
import { calculerBalance, type LigneBalance } from "./etats-financiers";
import { lireLignes, type LigneLivre } from "./livres";
import { lireValorisation } from "@/lib/produits/valorisation";
import { m } from "@/lib/i18n/catalogue";
import { anneeExercice, moisDebutValide, periodeExercice } from "./exercice-regles";

/**
 * Clôture d'exercice (2026-11-02). L'exercice est l'année civile. Les comptes de gestion (classes 6 charges, 7 produits, 8 HAO) sont
 * **soldés** par une écriture de clôture (journal manuel) dont la contrepartie est le résultat : crédit du 120000 en cas de bénéfice,
 * débit du 129000 en cas de perte. Le grand livre étant continu, ce solde remet les comptes de gestion à zéro pour l'exercice suivant
 * et les comptes de bilan (classes 1 à 5) se « reportent à nouveau » d'eux-mêmes, sans écriture d'ouverture. La clôture verrouille
 * ensuite la comptabilité jusqu'à la fin de l'exercice. Un exercice ne se clôture qu'une fois, dans l'ordre, après sa fin.
 */

const CLASSES_DE_GESTION = [6, 7, 8];

export { periodeExercice };

/** Premier mois de l'exercice de l'entreprise (1 = année civile). */
export async function moisDebutExercice(tx: TransactionDrizzle, entrepriseId: string): Promise<number> {
  const [e] = await tx.select({ mois: entreprise.moisDebutExercice }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  return moisDebutValide(e?.mois) ? e.mois : 1;
}

export type LigneCloture = { numero: string; libelle: string; debit: number; credit: number };
export type PlanCloture = { lignes: LigneCloture[]; resultatNet: number };

/**
 * Règle pure : à partir de la balance cumulée à la fin de l'exercice, construit les lignes qui soldent chaque compte de gestion
 * (un solde débiteur se solde par un crédit et inversement) et la ligne de résultat. `resultatNet` > 0 = bénéfice. Les lignes
 * s'équilibrent toujours (somme des débits = somme des crédits).
 */
export function calculerPlanCloture(balance: LigneBalance[]): PlanCloture {
  const lignes: LigneCloture[] = [];
  let sommeSoldes = 0;
  for (const l of balance) {
    if (!CLASSES_DE_GESTION.includes(l.classe) || l.solde === 0) continue;
    sommeSoldes += l.solde;
    lignes.push({ numero: l.numero, libelle: l.libelle, debit: l.solde < 0 ? -l.solde : 0, credit: l.solde > 0 ? l.solde : 0 });
  }
  // Σ soldes (débit − crédit) négatif = plus de produits que de charges = bénéfice.
  const resultatNet = -sommeSoldes;
  if (resultatNet > 0) lignes.push({ numero: "120000", libelle: "Résultat net de l'exercice (bénéfice)", debit: 0, credit: resultatNet });
  else if (resultatNet < 0) lignes.push({ numero: "129000", libelle: "Résultat net de l'exercice (perte)", debit: -resultatNet, credit: 0 });
  return { lignes, resultatNet };
}

export type ApercuCloture = {
  annee: number;
  dejaCloture: { dateCloture: Date; resultatNet: number } | null;
  plan: PlanCloture;
  produits: number;
  charges: number;
  /** Raisons qui empêchent la clôture maintenant (liste vide = clôturable). Clés françaises, traduites par l'appelant. */
  obstacles: string[];
};

async function anneesAvecEcritures(tx: TransactionDrizzle, entrepriseId: string, moisDebut: number): Promise<number[]> {
  const date = sql`(${ecritureComptable.dateEcriture} + interval '1 hour')`;
  const lignes = await tx
    .selectDistinct({ annee: sql<number>`(extract(year from ${date}) + case when ${moisDebut} > 1 and extract(month from ${date}) >= ${moisDebut} then 1 else 0 end)::int` })
    .from(ecritureComptable)
    .where(eq(ecritureComptable.entrepriseId, entrepriseId));
  return lignes.map((l) => l.annee).sort((a, b) => a - b);
}

/** État d'un exercice : résultat prévu, écritures de clôture qui seraient passées et obstacles éventuels. */
export async function apercuCloture(tx: TransactionDrizzle, entrepriseId: string, annee: number, maintenant: Date = new Date()): Promise<ApercuCloture | null> {
  const moisDebut = await moisDebutExercice(tx, entrepriseId);
  const periode = periodeExercice(annee, moisDebut);
  if (!periode) return null;
  const [deja] = await tx.select({ dateCloture: clotureExercice.dateCloture, resultatNet: clotureExercice.resultatNet }).from(clotureExercice).where(and(eq(clotureExercice.entrepriseId, entrepriseId), eq(clotureExercice.annee, annee)));
  const balance = await calculerBalance(tx, entrepriseId, periode.au);
  const plan = calculerPlanCloture(balance);
  const produits = balance.filter((l) => l.classe === 7).reduce((s, l) => s - l.solde, 0);
  const charges = balance.filter((l) => l.classe === 6).reduce((s, l) => s + l.solde, 0);

  const obstacles: string[] = [];
  if (!deja) {
    if (periode.au.getTime() > maintenant.getTime()) obstacles.push(m("Cet exercice n'est pas terminé : on ne clôture qu'après son dernier jour."));
    const clotures = new Set((await tx.select({ annee: clotureExercice.annee }).from(clotureExercice).where(eq(clotureExercice.entrepriseId, entrepriseId))).map((c) => c.annee));
    const anterieurs = (await anneesAvecEcritures(tx, entrepriseId, moisDebut)).filter((a) => a < annee && !clotures.has(a));
    if (anterieurs.length > 0) obstacles.push(m("Clôturez d'abord les exercices précédents, dans l'ordre."));
    const [monEntreprise] = await tx.select({ verrou: entreprise.dateVerrouillageComptable }).from(entreprise).where(eq(entreprise.id, entrepriseId));
    if (verifierDateNonVerrouillee(monEntreprise?.verrou ?? null, periode.au)) obstacles.push(m("La comptabilité est déjà verrouillée jusqu'à la fin de cet exercice : déverrouillez-la d'abord pour passer l'écriture de clôture."));
    const valo = await lireValorisation(tx, entrepriseId, periode.au);
    if (valo.lignes.length > 0 && valo.ecart !== 0) obstacles.push(m("Le stock n'est pas à jour en comptabilité : constatez d'abord la variation de stock (Produits → Valeur du stock)."));
    if (plan.lignes.length === 0) obstacles.push(m("Aucun compte de charges ou de produits à solder : rien à clôturer."));
  }
  return { annee, dejaCloture: deja ?? null, plan, produits, charges, obstacles };
}

export type ResultatCloture = { ok: true; resultatNet: number; numero: string } | { ok: false; erreur: string };

/**
 * Clôture l'exercice : passe l'écriture de clôture (journal manuel équilibré), enregistre la clôture et verrouille la comptabilité
 * jusqu'à la fin de l'exercice. Tout ou rien (une seule transaction). À appeler dans la transaction de l'entreprise (RLS), droit
 * comptable revérifié par l'appelant. Deux clôtures simultanées du même exercice : l'index unique en laisse passer une seule.
 */
export async function cloturerExercice(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, annee: number, maintenant: Date = new Date()): Promise<ResultatCloture> {
  const periode = periodeExercice(annee, await moisDebutExercice(tx, entrepriseId));
  if (!periode) return { ok: false, erreur: m("Exercice invalide.") };
  const apercu = await apercuCloture(tx, entrepriseId, annee, maintenant);
  if (!apercu) return { ok: false, erreur: m("Exercice invalide.") };
  if (apercu.dejaCloture) return { ok: false, erreur: m("Cet exercice est déjà clôturé.") };
  if (apercu.obstacles.length > 0) return { ok: false, erreur: apercu.obstacles[0] };

  const numerosNecessaires = apercu.plan.lignes.map((l) => l.numero);
  const comptes = await tx.select({ id: compteComptable.id, numero: compteComptable.numero }).from(compteComptable);
  const idParNumero = new Map(comptes.map((c) => [c.numero, c.id]));
  if (numerosNecessaires.some((n) => !idParNumero.has(n))) return { ok: false, erreur: m("Un compte nécessaire à la clôture est introuvable : contactez le support.") };

  const [etat] = await tx.select({ verrou: entreprise.dateVerrouillageComptable }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  const monVerrouAvant = etat?.verrou ?? null;
  const libelle = `Clôture de l'exercice ${annee}`;
  const numero = await genererNumeroJournalManuel(tx, entrepriseId);
  const [journal] = await tx.insert(journalManuel).values({ entrepriseId, numero, libelle, dateEcriture: periode.au, creeParId: utilisateurId }).returning({ id: journalManuel.id });
  await tx.insert(ecritureComptable).values(
    apercu.plan.lignes.map((l) => ({ entrepriseId, dateEcriture: periode.au, libelle, compteId: idParNumero.get(l.numero)!, debit: l.debit, credit: l.credit, journalManuelId: journal.id }))
  );

  const insere = await tx
    .insert(clotureExercice)
    .values({ entrepriseId, annee, dateCloture: maintenant, resultatNet: apercu.plan.resultatNet, journalManuelId: journal.id, verrouAvant: monVerrouAvant, cloturePar: utilisateurId })
    .onConflictDoNothing()
    .returning({ id: clotureExercice.id });
  if (insere.length === 0) throw new Error("Exercice déjà clôturé en parallèle : annulation de la transaction.");

  await tx.update(entreprise).set({ dateVerrouillageComptable: periode.au }).where(eq(entreprise.id, entrepriseId));
  return { ok: true, resultatNet: apercu.plan.resultatNet, numero };
}

/** Années proposées sur la page : celles qui ont des écritures, plus l'année en cours, plus les exercices déjà clôturés. */
export async function exercicesConnus(tx: TransactionDrizzle, entrepriseId: string, maintenant: Date = new Date()): Promise<number[]> {
  const moisDebut = await moisDebutExercice(tx, entrepriseId);
  const annees = new Set<number>(await anneesAvecEcritures(tx, entrepriseId, moisDebut));
  (await tx.select({ annee: clotureExercice.annee }).from(clotureExercice).where(eq(clotureExercice.entrepriseId, entrepriseId))).forEach((c) => annees.add(c.annee));
  const local = new Date(maintenant.getTime() + 60 * 60 * 1000);
  annees.add(anneeExercice(local.getUTCFullYear(), local.getUTCMonth() + 1, moisDebut));
  return [...annees].sort((a, b) => b - a);
}

/**
 * Lignes d'un exercice SANS son écriture de clôture : c'est ce qui permet de présenter le compte de résultat d'un exercice déjà
 * clôturé (sinon la clôture le remettrait à zéro).
 */
export async function lignesExerciceSansCloture(tx: TransactionDrizzle, entrepriseId: string, annee: number): Promise<LigneLivre[]> {
  const periode = periodeExercice(annee, await moisDebutExercice(tx, entrepriseId));
  if (!periode) return [];
  const [c] = await tx.select({ journalManuelId: clotureExercice.journalManuelId }).from(clotureExercice).where(and(eq(clotureExercice.entrepriseId, entrepriseId), eq(clotureExercice.annee, annee)));
  const conditions = [gte(ecritureComptable.dateEcriture, periode.du), lte(ecritureComptable.dateEcriture, periode.au)];
  if (c?.journalManuelId) conditions.push(or(isNull(ecritureComptable.journalManuelId), ne(ecritureComptable.journalManuelId, c.journalManuelId))!);
  return lireLignes(tx, entrepriseId, conditions);
}

export type ResultatReouverture = { ok: true; resultatAnnule: number } | { ok: false; erreur: string };

/**
 * Rouvre le DERNIER exercice clôturé (priorité 2.2, 2026-11-02), par exemple pour corriger une écriture oubliée. L'écriture de clôture
 * est **contre-passée à la date de fin de l'exercice** (jamais supprimée : l'historique montre la clôture puis son annulation), le
 * verrouillage d'avant la clôture est rétabli, la clôture est retirée (l'exercice peut être clôturé de nouveau plus tard) et une
 * trace garde qui l'a rouvert, quand, pourquoi et le résultat annulé. On ne rouvre jamais un exercice si un exercice POSTÉRIEUR est
 * clôturé : on remonte dans l'ordre inverse. Tout ou rien (une transaction).
 */
export async function rouvrirExercice(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, annee: number, motifBrut: string): Promise<ResultatReouverture> {
  const motif = motifBrut.replace(/\s+/g, " ").trim();
  if (motif.length < 5 || motif.length > 300) return { ok: false, erreur: m("Indiquez pourquoi vous rouvrez cet exercice (5 à 300 caractères).") };
  const periode = periodeExercice(annee, await moisDebutExercice(tx, entrepriseId));
  if (!periode) return { ok: false, erreur: m("Exercice invalide.") };

  const clotures = await tx.select().from(clotureExercice).where(eq(clotureExercice.entrepriseId, entrepriseId)).orderBy(desc(clotureExercice.annee));
  const cible = clotures.find((c) => c.annee === annee);
  if (!cible) return { ok: false, erreur: m("Cet exercice n'est pas clôturé.") };
  if (clotures[0].annee !== annee) return { ok: false, erreur: m("Rouvrez d'abord l'exercice le plus récent : on remonte dans l'ordre inverse.") };
  if (!cible.journalManuelId) return { ok: false, erreur: m("L'écriture de clôture est introuvable : contactez le support.") };

  // 1. Le verrou d'avant la clôture revient (sinon l'écriture d'annulation, datée de la fin de l'exercice, serait refusée).
  await tx.update(entreprise).set({ dateVerrouillageComptable: cible.verrouAvant }).where(eq(entreprise.id, entrepriseId));
  // 2. L'écriture de clôture est contre-passée à la fin de l'exercice.
  const nb = await contrePasserEcritures(tx, entrepriseId, eq(ecritureComptable.journalManuelId, cible.journalManuelId), `Réouverture de l'exercice ${annee}`, periode.au);
  if (nb === 0) return { ok: false, erreur: m("L'écriture de clôture a déjà été annulée.") };
  // 3. La clôture est retirée, la réouverture est tracée.
  await tx.delete(clotureExercice).where(eq(clotureExercice.id, cible.id));
  await tx.insert(reouvertureExercice).values({ entrepriseId, annee, motif, resultatAnnule: cible.resultatNet, rouvertPar: utilisateurId });
  return { ok: true, resultatAnnule: cible.resultatNet };
}

/** Historique des réouvertures (les plus récentes d'abord) pour la page de clôture. */
export async function listerReouvertures(tx: TransactionDrizzle, entrepriseId: string) {
  return tx.select().from(reouvertureExercice).where(eq(reouvertureExercice.entrepriseId, entrepriseId)).orderBy(desc(reouvertureExercice.rouvertLe));
}

/** Le dernier exercice clôturé (le seul qu'on puisse rouvrir), ou null. */
export async function dernierExerciceCloture(tx: TransactionDrizzle, entrepriseId: string): Promise<number | null> {
  const [c] = await tx.select({ annee: clotureExercice.annee }).from(clotureExercice).where(eq(clotureExercice.entrepriseId, entrepriseId)).orderBy(desc(clotureExercice.annee)).limit(1);
  return c?.annee ?? null;
}

/**
 * Change le premier mois de l'exercice (1 = année civile). Refusé dès qu'un exercice est clôturé : les clôtures passées sont figées
 * sur leurs dates. Réouvrir tous les exercices clôturés permet de le modifier de nouveau.
 */
export async function definirMoisDebutExercice(tx: TransactionDrizzle, entrepriseId: string, mois: number): Promise<{ ok: true } | { ok: false; erreur: string }> {
  if (!moisDebutValide(mois)) return { ok: false, erreur: m("Choisissez un mois de 1 à 12.") };
  const [cloture] = await tx.select({ id: clotureExercice.id }).from(clotureExercice).where(eq(clotureExercice.entrepriseId, entrepriseId)).limit(1);
  if (cloture) return { ok: false, erreur: m("Un exercice est déjà clôturé : rouvrez-les d'abord pour changer le début de l'exercice.") };
  await tx.update(entreprise).set({ moisDebutExercice: mois }).where(eq(entreprise.id, entrepriseId));
  return { ok: true };
}

import { and, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { clotureExercice, compteComptable, ecritureComptable, entreprise, journalManuel } from "@/db/schema";
import { genererNumeroJournalManuel } from "@/lib/facturation/numerotation";
import { verifierDateNonVerrouillee } from "./verrouillage";
import { calculerBalance, type LigneBalance } from "./etats-financiers";
import { dateDouala, lireLignes, type LigneLivre } from "./livres";
import { lireValorisation } from "@/lib/produits/valorisation";
import { m } from "@/lib/i18n/catalogue";

/**
 * Clôture d'exercice (2026-11-02). L'exercice est l'année civile. Les comptes de gestion (classes 6 charges, 7 produits, 8 HAO) sont
 * **soldés** par une écriture de clôture (journal manuel) dont la contrepartie est le résultat : crédit du 120000 en cas de bénéfice,
 * débit du 129000 en cas de perte. Le grand livre étant continu, ce solde remet les comptes de gestion à zéro pour l'exercice suivant
 * et les comptes de bilan (classes 1 à 5) se « reportent à nouveau » d'eux-mêmes, sans écriture d'ouverture. La clôture verrouille
 * ensuite la comptabilité jusqu'à la fin de l'exercice. Un exercice ne se clôture qu'une fois, dans l'ordre, après sa fin.
 */

const CLASSES_DE_GESTION = [6, 7, 8];

export function periodeExercice(annee: number): { du: Date; au: Date } | null {
  if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) return null;
  const du = dateDouala(`${annee}-01-01`, false);
  const au = dateDouala(`${annee}-12-31`, true);
  return du && au ? { du, au } : null;
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

async function anneesAvecEcritures(tx: TransactionDrizzle, entrepriseId: string): Promise<number[]> {
  const lignes = await tx
    .selectDistinct({ annee: sql<number>`extract(year from (${ecritureComptable.dateEcriture} + interval '1 hour'))::int` })
    .from(ecritureComptable)
    .where(eq(ecritureComptable.entrepriseId, entrepriseId));
  return lignes.map((l) => l.annee).sort((a, b) => a - b);
}

/** État d'un exercice : résultat prévu, écritures de clôture qui seraient passées et obstacles éventuels. */
export async function apercuCloture(tx: TransactionDrizzle, entrepriseId: string, annee: number, maintenant: Date = new Date()): Promise<ApercuCloture | null> {
  const periode = periodeExercice(annee);
  if (!periode) return null;
  const [deja] = await tx.select({ dateCloture: clotureExercice.dateCloture, resultatNet: clotureExercice.resultatNet }).from(clotureExercice).where(and(eq(clotureExercice.entrepriseId, entrepriseId), eq(clotureExercice.annee, annee)));
  const balance = await calculerBalance(tx, entrepriseId, periode.au);
  const plan = calculerPlanCloture(balance);
  const produits = balance.filter((l) => l.classe === 7).reduce((s, l) => s - l.solde, 0);
  const charges = balance.filter((l) => l.classe === 6).reduce((s, l) => s + l.solde, 0);

  const obstacles: string[] = [];
  if (!deja) {
    if (periode.au.getTime() > maintenant.getTime()) obstacles.push(m("Cet exercice n'est pas terminé : on ne clôture qu'après le 31 décembre."));
    const clotures = new Set((await tx.select({ annee: clotureExercice.annee }).from(clotureExercice).where(eq(clotureExercice.entrepriseId, entrepriseId))).map((c) => c.annee));
    const anterieurs = (await anneesAvecEcritures(tx, entrepriseId)).filter((a) => a < annee && !clotures.has(a));
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
  const periode = periodeExercice(annee);
  if (!periode) return { ok: false, erreur: m("Exercice invalide.") };
  const apercu = await apercuCloture(tx, entrepriseId, annee, maintenant);
  if (!apercu) return { ok: false, erreur: m("Exercice invalide.") };
  if (apercu.dejaCloture) return { ok: false, erreur: m("Cet exercice est déjà clôturé.") };
  if (apercu.obstacles.length > 0) return { ok: false, erreur: apercu.obstacles[0] };

  const numerosNecessaires = apercu.plan.lignes.map((l) => l.numero);
  const comptes = await tx.select({ id: compteComptable.id, numero: compteComptable.numero }).from(compteComptable);
  const idParNumero = new Map(comptes.map((c) => [c.numero, c.id]));
  if (numerosNecessaires.some((n) => !idParNumero.has(n))) return { ok: false, erreur: m("Un compte nécessaire à la clôture est introuvable : contactez le support.") };

  const libelle = `Clôture de l'exercice ${annee}`;
  const numero = await genererNumeroJournalManuel(tx, entrepriseId);
  const [journal] = await tx.insert(journalManuel).values({ entrepriseId, numero, libelle, dateEcriture: periode.au, creeParId: utilisateurId }).returning({ id: journalManuel.id });
  await tx.insert(ecritureComptable).values(
    apercu.plan.lignes.map((l) => ({ entrepriseId, dateEcriture: periode.au, libelle, compteId: idParNumero.get(l.numero)!, debit: l.debit, credit: l.credit, journalManuelId: journal.id }))
  );

  const insere = await tx
    .insert(clotureExercice)
    .values({ entrepriseId, annee, dateCloture: maintenant, resultatNet: apercu.plan.resultatNet, journalManuelId: journal.id, cloturePar: utilisateurId })
    .onConflictDoNothing()
    .returning({ id: clotureExercice.id });
  if (insere.length === 0) throw new Error("Exercice déjà clôturé en parallèle : annulation de la transaction.");

  await tx.update(entreprise).set({ dateVerrouillageComptable: periode.au }).where(eq(entreprise.id, entrepriseId));
  return { ok: true, resultatNet: apercu.plan.resultatNet, numero };
}

/** Années proposées sur la page : celles qui ont des écritures, plus l'année en cours, plus les exercices déjà clôturés. */
export async function exercicesConnus(tx: TransactionDrizzle, entrepriseId: string, maintenant: Date = new Date()): Promise<number[]> {
  const annees = new Set<number>(await anneesAvecEcritures(tx, entrepriseId));
  (await tx.select({ annee: clotureExercice.annee }).from(clotureExercice).where(eq(clotureExercice.entrepriseId, entrepriseId))).forEach((c) => annees.add(c.annee));
  annees.add(Number(new Date(maintenant.getTime() + 60 * 60 * 1000).toISOString().slice(0, 4)));
  return [...annees].sort((a, b) => b - a);
}

/**
 * Lignes d'un exercice SANS son écriture de clôture : c'est ce qui permet de présenter le compte de résultat d'un exercice déjà
 * clôturé (sinon la clôture le remettrait à zéro).
 */
export async function lignesExerciceSansCloture(tx: TransactionDrizzle, entrepriseId: string, annee: number): Promise<LigneLivre[]> {
  const periode = periodeExercice(annee);
  if (!periode) return [];
  const [c] = await tx.select({ journalManuelId: clotureExercice.journalManuelId }).from(clotureExercice).where(and(eq(clotureExercice.entrepriseId, entrepriseId), eq(clotureExercice.annee, annee)));
  const conditions = [gte(ecritureComptable.dateEcriture, periode.du), lte(ecritureComptable.dateEcriture, periode.au)];
  if (c?.journalManuelId) conditions.push(or(isNull(ecritureComptable.journalManuelId), ne(ecritureComptable.journalManuelId, c.journalManuelId))!);
  return lireLignes(tx, entrepriseId, conditions);
}

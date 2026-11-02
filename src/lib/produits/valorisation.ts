import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { compteComptable, ecritureComptable, entreprise, journalManuel, produit } from "@/db/schema";
import { genererNumeroJournalManuel } from "@/lib/facturation/numerotation";
import { verifierDateNonVerrouillee } from "@/lib/comptabilite/verrouillage";
import { m } from "@/lib/i18n/catalogue";

/**
 * Valeur du stock (2026-11-02) : chaque bien suivi vaut « stock × coût moyen pondéré » (un stock négatif ne vaut jamais moins que
 * zéro). La comptabilité suit l'**inventaire intermittent** SYSCOHADA : les achats restent en charge (compte 601) au fil de l'eau,
 * et à chaque inventaire une seule écriture constate la variation de stock — débit 311000 « Marchandises » / crédit 603000
 * « Variations des stocks » quand le stock a pris de la valeur, l'inverse quand il en a perdu. Le montant est toujours l'écart entre
 * la valeur du stock et le solde réel du compte 311000 : refaire l'écriture sans mouvement entre-temps ne produit rien (idempotent).
 */
export type LigneValorisation = { id: string; nom: string; stockActuel: number; coutMoyen: number; valeur: number };
export type Valorisation = {
  lignes: LigneValorisation[];
  total: number;
  /** Solde du compte 311000 à la date demandée : ce que la comptabilité reconnaît déjà comme stock. */
  soldeComptable: number;
  /** total − soldeComptable : ce que l'écriture de variation constaterait (positif = le stock a pris de la valeur). */
  ecart: number;
};

export function valeurLigne(stockActuel: number, coutMoyen: number): number {
  return Math.max(stockActuel, 0) * coutMoyen;
}

async function soldeCompte311(tx: TransactionDrizzle, entrepriseId: string, jusquau: Date): Promise<number> {
  const lignes = await tx
    .select({ debit: ecritureComptable.debit, credit: ecritureComptable.credit })
    .from(ecritureComptable)
    .innerJoin(compteComptable, eq(ecritureComptable.compteId, compteComptable.id))
    .where(and(eq(ecritureComptable.entrepriseId, entrepriseId), eq(compteComptable.numero, "311000"), lte(ecritureComptable.dateEcriture, jusquau)));
  return lignes.reduce((s, l) => s + l.debit - l.credit, 0);
}

export async function lireValorisation(tx: TransactionDrizzle, entrepriseId: string, jusquau: Date = new Date()): Promise<Valorisation> {
  const produits = await tx
    .select({ id: produit.id, nom: produit.nom, stockActuel: produit.stockActuel, coutMoyen: produit.coutMoyen })
    .from(produit)
    .where(and(eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN"), eq(produit.suiviStock, true)))
    .orderBy(asc(produit.nom));
  const lignes = produits.map((p) => ({ ...p, valeur: valeurLigne(p.stockActuel, p.coutMoyen) }));
  const total = lignes.reduce((s, l) => s + l.valeur, 0);
  const soldeComptable = await soldeCompte311(tx, entrepriseId, jusquau);
  return { lignes, total, soldeComptable, ecart: total - soldeComptable };
}

export type ResultatVariation = { ok: true; montant: number; hausse: boolean; numero: string } | { ok: false; erreur: string };

/**
 * Passe l'écriture de variation de stock à la date donnée (journal manuel numéroté, visible dans « Journaux manuels »). Refuse une
 * date future, une période verrouillée, ou un écart nul. À appeler dans la transaction de l'entreprise (RLS), droit comptable
 * revérifié par l'appelant.
 */
export async function constaterVariationStock(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, date: Date, maintenant: Date = new Date()): Promise<ResultatVariation> {
  if (Number.isNaN(date.getTime())) return { ok: false, erreur: m("Date invalide.") };
  if (date.getTime() > maintenant.getTime() + 24 * 60 * 60 * 1000) return { ok: false, erreur: m("La date ne peut pas être dans le futur.") };

  const [monEntreprise] = await tx.select({ verrou: entreprise.dateVerrouillageComptable }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  const erreurVerrou = verifierDateNonVerrouillee(monEntreprise?.verrou ?? null, date);
  if (erreurVerrou) return { ok: false, erreur: erreurVerrou };

  const { ecart } = await lireValorisation(tx, entrepriseId, date);
  if (ecart === 0) return { ok: false, erreur: m("Le stock est déjà constaté en comptabilité : rien à enregistrer.") };

  const comptes = await tx.select({ id: compteComptable.id, numero: compteComptable.numero }).from(compteComptable).where(inArray(compteComptable.numero, ["311000", "603000"]));
  const stock = comptes.find((c) => c.numero === "311000");
  const variation = comptes.find((c) => c.numero === "603000");
  if (!stock || !variation) return { ok: false, erreur: m("Le plan comptable ne contient pas les comptes 311000 et 603000 : contactez le support.") };

  const montant = Math.abs(ecart);
  const hausse = ecart > 0;
  const libelle = `Variation de stock au ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Douala" }).format(date)}`;
  const numero = await genererNumeroJournalManuel(tx, entrepriseId);
  const [journal] = await tx.insert(journalManuel).values({ entrepriseId, numero, libelle, dateEcriture: date, creeParId: utilisateurId }).returning({ id: journalManuel.id });
  await tx.insert(ecritureComptable).values([
    { entrepriseId, dateEcriture: date, libelle, compteId: stock.id, debit: hausse ? montant : 0, credit: hausse ? 0 : montant, journalManuelId: journal.id },
    { entrepriseId, dateEcriture: date, libelle, compteId: variation.id, debit: hausse ? 0 : montant, credit: hausse ? montant : 0, journalManuelId: journal.id },
  ]);
  return { ok: true, montant, hausse, numero };
}

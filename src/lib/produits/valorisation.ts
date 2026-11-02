import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { compteComptable, depot, ecritureComptable, entreprise, journalManuel, mouvementStock, produit, stockDepot } from "@/db/schema";
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

/**
 * Valeur du stock à une date, au global ou pour un seul dépôt. Pour « maintenant » sans dépôt, c'est le stock et le coût moyen courants.
 * Pour une date passée, la quantité est reconstituée à partir de l'état actuel en défaisant les mouvements postérieurs à la date, et le
 * coût moyen est celui enregistré juste après le dernier mouvement antérieur (colonne `cout_moyen_apres`, remplie par la base ; pour
 * l'historique d'avant la priorité 2.6, c'est le coût moyen du jour de la migration, faute de mieux). Un dépôt donné ne change pas le
 * calcul du coût : le coût moyen est celui du produit, tous dépôts confondus.
 */
export async function lireValorisation(tx: TransactionDrizzle, entrepriseId: string, jusquau: Date = new Date(), depotId: string | null = null, maintenant: Date = new Date()): Promise<Valorisation> {
  const passe = jusquau.getTime() < maintenant.getTime();
  const produits = await tx
    .select({ id: produit.id, nom: produit.nom, stockActuel: produit.stockActuel, coutMoyen: produit.coutMoyen, suiviStock: produit.suiviStock })
    .from(produit)
    .where(and(eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN")))
    .orderBy(asc(produit.nom));

  const stockAu = new Map<string, number>(produits.map((p) => [p.id, p.stockActuel]));
  const coutAu = new Map<string, number>(produits.map((p) => [p.id, p.coutMoyen]));

  let principalCible = false;
  if (depotId) {
    const [cible] = await tx.select({ id: depot.id, principal: depot.principal }).from(depot).where(and(eq(depot.id, depotId), eq(depot.entrepriseId, entrepriseId)));
    if (!cible) return { lignes: [], total: 0, soldeComptable: await soldeCompte311(tx, entrepriseId, jusquau), ecart: 0 };
    principalCible = cible.principal;
    const quantites = await tx.select({ produitId: stockDepot.produitId, depotId: stockDepot.depotId, quantite: stockDepot.quantite }).from(stockDepot).where(eq(stockDepot.entrepriseId, entrepriseId));
    const autres = new Map<string, number>();
    const dedans = new Map<string, number>();
    for (const q of quantites) {
      if (q.depotId === depotId) dedans.set(q.produitId, q.quantite);
      else autres.set(q.produitId, (autres.get(q.produitId) ?? 0) + q.quantite);
    }
    for (const p of produits) {
      // Le dépôt principal reçoit tout ce que les autres dépôts ne portent pas (stock d'avant les dépôts compris).
      stockAu.set(p.id, cible.principal ? p.stockActuel - (autres.get(p.id) ?? 0) : (dedans.get(p.id) ?? 0));
    }
  }

  if (passe) {
    const filtreDepot = depotId ? (principalCible ? or(eq(mouvementStock.depotId, depotId), isNull(mouvementStock.depotId)) : eq(mouvementStock.depotId, depotId)) : undefined;
    const apres = await tx
      .select({ produitId: mouvementStock.produitId, total: sql<number>`coalesce(sum(${mouvementStock.quantite}), 0)::int` })
      .from(mouvementStock)
      .where(and(eq(mouvementStock.entrepriseId, entrepriseId), gt(mouvementStock.creeLe, jusquau), filtreDepot))
      .groupBy(mouvementStock.produitId);
    for (const a of apres) if (stockAu.has(a.produitId)) stockAu.set(a.produitId, (stockAu.get(a.produitId) ?? 0) - a.total);

    const couts = await tx.execute(
      sql`select distinct on (produit_id) produit_id as "produitId", cout_moyen_apres as "cout" from mouvement_stock where entreprise_id = ${entrepriseId} and cree_le <= ${jusquau.toISOString()}::timestamp and cout_moyen_apres is not null order by produit_id, cree_le desc, id desc`
    );
    for (const c of couts.rows as { produitId: string; cout: number }[]) if (coutAu.has(c.produitId)) coutAu.set(c.produitId, c.cout);
  }

  const lignes = produits
    .filter((p) => (depotId || passe ? (stockAu.get(p.id) ?? 0) !== 0 || (!depotId && p.suiviStock) : p.suiviStock))
    .map((p) => {
      const stock = stockAu.get(p.id) ?? 0;
      const cout = coutAu.get(p.id) ?? 0;
      return { id: p.id, nom: p.nom, stockActuel: stock, coutMoyen: cout, valeur: valeurLigne(stock, cout) };
    });
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

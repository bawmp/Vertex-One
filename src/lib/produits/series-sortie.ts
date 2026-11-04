import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { numeroSerie, produit } from "@/db/schema";
import { exces, finGarantie, numerosAVendreAvecChoix } from "./series-regles";

/**
 * Effet des mouvements de stock sur les numéros de série. Séparé de `series.ts` (gestion) pour que `stock.ts` puisse l'appeler sans import
 * circulaire. Sans effet sur un produit qui ne suit pas ses numéros de série.
 */

/** Une vente sort `quantite` unités : elle emporte les numéros en stock les plus anciens et les rattache au document de vente. */
export async function vendreSeries(tx: TransactionDrizzle, entrepriseId: string, produitId: string, quantite: number, document: { type?: string; id?: string }, choisis: string[] = []): Promise<void> {
  // Tous les numéros en stock (les choisis peuvent ne pas être parmi les plus anciens) : le choix est appliqué par la règle pure.
  const enStock = await tx
    .select({ id: numeroSerie.id, numero: numeroSerie.numero, entreLe: numeroSerie.entreLe })
    .from(numeroSerie)
    .where(and(eq(numeroSerie.entrepriseId, entrepriseId), eq(numeroSerie.produitId, produitId), eq(numeroSerie.statut, "EN_STOCK")));
  const pris = numerosAVendreAvecChoix(enStock, quantite, choisis);
  if (pris.length === 0) return;
  // Garantie : la fin se calcule d'après la durée du produit, à partir du jour de la vente (heure de Douala).
  const [p] = await tx.select({ mois: produit.dureeGarantieMois }).from(produit).where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId)));
  const jour = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(new Date());
  const garantieFin = p?.mois ? finGarantie(jour, p.mois) : null;
  await tx
    .update(numeroSerie)
    .set({ statut: "VENDU", venduLe: sql`now()`, documentType: document.type ?? null, documentId: document.id ?? null, garantieFin })
    .where(inArray(numeroSerie.id, pris.map((p) => p.id)));
}

/** Après toute autre sortie (correction, annulation d'achat…), il ne peut pas y avoir plus de numéros en stock que d'unités : l'excédent est retiré. */
export async function harmoniserSeries(tx: TransactionDrizzle, entrepriseId: string, produitId: string): Promise<void> {
  const [p] = await tx.select({ stock: produit.stockActuel, suiviSerie: produit.suiviSerie }).from(produit).where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId)));
  if (!p?.suiviSerie) return;
  const enStock = await tx
    .select({ id: numeroSerie.id })
    .from(numeroSerie)
    .where(and(eq(numeroSerie.entrepriseId, entrepriseId), eq(numeroSerie.produitId, produitId), eq(numeroSerie.statut, "EN_STOCK")))
    .orderBy(desc(numeroSerie.entreLe), desc(numeroSerie.numero));
  const aRetirer = exces(enStock.length, p.stock);
  if (aRetirer === 0) return;
  await tx.update(numeroSerie).set({ statut: "RETIRE" }).where(inArray(numeroSerie.id, enStock.slice(0, aRetirer).map((s) => s.id)));
}

/** Une vente annulée remet en stock les numéros qu'elle avait emportés. */
export async function restituerSeries(tx: TransactionDrizzle, entrepriseId: string, produitId: string, documentType: string, documentId: string): Promise<void> {
  await tx
    .update(numeroSerie)
    .set({ statut: "EN_STOCK", venduLe: null, documentType: null, documentId: null, garantieFin: null })
    .where(and(eq(numeroSerie.entrepriseId, entrepriseId), eq(numeroSerie.produitId, produitId), eq(numeroSerie.statut, "VENDU"), eq(numeroSerie.documentType, documentType), eq(numeroSerie.documentId, documentId)));
}

/** Efface les numéros de série de produits (fin du suivi du stock ou des numéros de série). */
export async function effacerSeries(tx: TransactionDrizzle, entrepriseId: string, produitIds: string[]): Promise<void> {
  if (produitIds.length === 0) return;
  await tx.delete(numeroSerie).where(and(eq(numeroSerie.entrepriseId, entrepriseId), inArray(numeroSerie.produitId, produitIds)));
}

/** Numéros vendus par un document (facture, ticket), regroupés par produit et triés par numéro. */
export async function seriesVenduesDuDocument(tx: TransactionDrizzle, entrepriseId: string, documentType: string, documentId: string): Promise<Map<string, string[]>> {
  const lignes = await tx
    .select({ produitId: numeroSerie.produitId, numero: numeroSerie.numero })
    .from(numeroSerie)
    .where(and(eq(numeroSerie.entrepriseId, entrepriseId), eq(numeroSerie.statut, "VENDU"), eq(numeroSerie.documentType, documentType), eq(numeroSerie.documentId, documentId)))
    .orderBy(asc(numeroSerie.numero));
  const par = new Map<string, string[]>();
  for (const l of lignes) par.set(l.produitId, [...(par.get(l.produitId) ?? []), l.numero]);
  return par;
}

/**
 * Retour d'une vente (avoir avec remise en stock) : `quantite` numéros vendus par ce document pour ce produit redeviennent « en stock »,
 * en commençant par les derniers numéros. Le stock est déjà remonté par l'avoir : ici on ne change que l'état des numéros. Si ce ne sont
 * pas les bons, « Changer le numéro » sur la facture les échange.
 */
export async function restituerSeriesRetour(tx: TransactionDrizzle, entrepriseId: string, produitId: string, documentType: string, documentId: string, quantite: number): Promise<number> {
  if (quantite <= 0) return 0;
  const vendus = await tx
    .select({ id: numeroSerie.id })
    .from(numeroSerie)
    .where(and(eq(numeroSerie.entrepriseId, entrepriseId), eq(numeroSerie.produitId, produitId), eq(numeroSerie.statut, "VENDU"), eq(numeroSerie.documentType, documentType), eq(numeroSerie.documentId, documentId)))
    .orderBy(desc(numeroSerie.numero))
    .limit(Math.floor(quantite));
  if (vendus.length === 0) return 0;
  await tx.update(numeroSerie).set({ statut: "EN_STOCK", venduLe: null, documentType: null, documentId: null, garantieFin: null }).where(inArray(numeroSerie.id, vendus.map((v) => v.id)));
  return vendus.length;
}

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { numeroSerie, produit } from "@/db/schema";
import { exces, numerosAVendre } from "./series-regles";

/**
 * Effet des mouvements de stock sur les numéros de série. Séparé de `series.ts` (gestion) pour que `stock.ts` puisse l'appeler sans import
 * circulaire. Sans effet sur un produit qui ne suit pas ses numéros de série.
 */

/** Une vente sort `quantite` unités : elle emporte les numéros en stock les plus anciens et les rattache au document de vente. */
export async function vendreSeries(tx: TransactionDrizzle, entrepriseId: string, produitId: string, quantite: number, document: { type?: string; id?: string }): Promise<void> {
  const enStock = await tx
    .select({ id: numeroSerie.id, numero: numeroSerie.numero, entreLe: numeroSerie.entreLe })
    .from(numeroSerie)
    .where(and(eq(numeroSerie.entrepriseId, entrepriseId), eq(numeroSerie.produitId, produitId), eq(numeroSerie.statut, "EN_STOCK")))
    .orderBy(asc(numeroSerie.entreLe), asc(numeroSerie.numero))
    .limit(Math.max(quantite, 0));
  const pris = numerosAVendre(enStock, quantite);
  if (pris.length === 0) return;
  await tx
    .update(numeroSerie)
    .set({ statut: "VENDU", venduLe: sql`now()`, documentType: document.type ?? null, documentId: document.id ?? null })
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
    .set({ statut: "EN_STOCK", venduLe: null, documentType: null, documentId: null })
    .where(and(eq(numeroSerie.entrepriseId, entrepriseId), eq(numeroSerie.produitId, produitId), eq(numeroSerie.statut, "VENDU"), eq(numeroSerie.documentType, documentType), eq(numeroSerie.documentId, documentId)));
}

/** Efface les numéros de série de produits (fin du suivi du stock ou des numéros de série). */
export async function effacerSeries(tx: TransactionDrizzle, entrepriseId: string, produitIds: string[]): Promise<void> {
  if (produitIds.length === 0) return;
  await tx.delete(numeroSerie).where(and(eq(numeroSerie.entrepriseId, entrepriseId), inArray(numeroSerie.produitId, produitIds)));
}

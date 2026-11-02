import { and, eq, gt, inArray } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { lotStock, produit } from "@/db/schema";
import { aujourdhuiDouala } from "@/lib/facturation/promesse-regles";
import { exces, repartirFEFO, type LotTri } from "./lots-regles";

/**
 * Effet des sorties de stock sur les lots. Séparé de `lots.ts` (gestion) pour que `stock.ts` puisse l'appeler sans import circulaire.
 * Sans effet sur un produit qui ne suit pas ses lots.
 */

type LotLu = LotTri & { numeroLot: string };

async function lotsDuProduit(tx: TransactionDrizzle, entrepriseId: string, produitId: string): Promise<LotLu[]> {
  const lignes = await tx
    .select({ id: lotStock.id, numeroLot: lotStock.numeroLot, datePeremption: lotStock.datePeremption, creeLe: lotStock.creeLe, quantite: lotStock.quantite })
    .from(lotStock)
    .where(and(eq(lotStock.entrepriseId, entrepriseId), eq(lotStock.produitId, produitId), gt(lotStock.quantite, 0)));
  return lignes;
}

async function appliquerRetraits(tx: TransactionDrizzle, lots: LotLu[], retraits: { lotId: string; quantite: number }[]): Promise<void> {
  for (const r of retraits) {
    const lot = lots.find((l) => l.id === r.lotId)!;
    const reste = lot.quantite - r.quantite;
    if (reste > 0) await tx.update(lotStock).set({ quantite: reste }).where(eq(lotStock.id, lot.id));
    else await tx.delete(lotStock).where(eq(lotStock.id, lot.id));
  }
}

/** Une vente sort `quantite` du produit : on la prend d'abord dans les lots qui se périment le plus tôt ; le reste vient du stock sans lot. */
export async function consommerLotsFEFO(tx: TransactionDrizzle, entrepriseId: string, produitId: string, quantite: number): Promise<void> {
  const lots = await lotsDuProduit(tx, entrepriseId, produitId);
  if (lots.length === 0) return;
  const { retraits } = repartirFEFO(lots, quantite, aujourdhuiDouala());
  await appliquerRetraits(tx, lots, retraits);
}

/** Après toute autre sortie (correction, annulation d'achat…), la somme des lots ne doit pas dépasser le stock : l'excédent est retiré. */
export async function harmoniserLots(tx: TransactionDrizzle, entrepriseId: string, produitId: string): Promise<void> {
  const [p] = await tx.select({ stock: produit.stockActuel, suiviLots: produit.suiviLots }).from(produit).where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId)));
  if (!p?.suiviLots) return;
  const lots = await lotsDuProduit(tx, entrepriseId, produitId);
  if (lots.length === 0) return;
  await appliquerRetraits(tx, lots, exces(lots, p.stock, aujourdhuiDouala()));
}

/** Efface les lots de produits (fin du suivi du stock ou des lots). */
export async function effacerLots(tx: TransactionDrizzle, entrepriseId: string, produitIds: string[]): Promise<void> {
  if (produitIds.length === 0) return;
  await tx.delete(lotStock).where(and(eq(lotStock.entrepriseId, entrepriseId), inArray(lotStock.produitId, produitIds)));
}

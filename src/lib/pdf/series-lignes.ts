import type { TransactionDrizzle } from "@/db/client";
import { repartirSeries } from "@/lib/produits/series-regles";
import { seriesVenduesDuDocument } from "@/lib/produits/series-sortie";

/** Ajoute à chaque ligne d'un document de vente les numéros de série vendus (vide pour un produit sans numéros) : ils s'impriment sous la désignation. */
export async function lignesAvecSeries<L extends { produitId: string | null; quantite: number }>(tx: TransactionDrizzle, entrepriseId: string, documentType: "FACTURE" | "RECU_VENTE", documentId: string, lignes: L[]) {
  if (!lignes.some((l) => l.produitId)) return lignes.map((l) => ({ ...l, series: [] as string[] }));
  return repartirSeries(lignes, await seriesVenduesDuDocument(tx, entrepriseId, documentType, documentId));
}

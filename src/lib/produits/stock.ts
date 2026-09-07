import { sql, inArray, eq, and } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { produit } from "@/db/schema";

type LigneAvecProduit = { produitId?: string | null; quantite: number };

/**
 * Catalogue Produits/Tarifs (échange du 2026-09-07, zoho-books-full-spec.md
 * section 5.3) : "une vente le diminue, un achat facturé l'augmente". Ne
 * touche que les BIEN avec suiviStock actif (jamais un SERVICE, qui n'a
 * pas de stock) — filtré ici par `and(inArray(...), eq(suiviStock, true))`
 * plutôt que côté appelant, pour que toute future ligne "produit inconnu ou
 * non suivi" soit silencieusement ignorée sans que chaque appelant n'ait à
 * y penser. Pas de blocage si le stock devient négatif (vente possible même
 * en rupture) — comme Zoho, qui ne bloque pas la vente, se contente de
 * suivre le nombre.
 */
async function ajusterStock(tx: TransactionDrizzle, lignes: LigneAvecProduit[], sens: 1 | -1): Promise<void> {
  const quantitesParProduit = new Map<string, number>();
  for (const l of lignes) {
    if (!l.produitId) continue;
    quantitesParProduit.set(l.produitId, (quantitesParProduit.get(l.produitId) ?? 0) + l.quantite);
  }
  if (quantitesParProduit.size === 0) return;

  const ids = [...quantitesParProduit.keys()];
  const produitsSuivis = await tx.select({ id: produit.id }).from(produit).where(and(inArray(produit.id, ids), eq(produit.suiviStock, true)));

  for (const { id } of produitsSuivis) {
    const quantite = quantitesParProduit.get(id)!;
    await tx
      .update(produit)
      .set({ stockActuel: sql`${produit.stockActuel} + ${sens * quantite}` })
      .where(eq(produit.id, id));
  }
}

export function decrementerStockVente(tx: TransactionDrizzle, lignes: LigneAvecProduit[]): Promise<void> {
  return ajusterStock(tx, lignes, -1);
}

/**
 * Mouvement inverse — appelé à la création d'une Facture fournisseur
 * (échange du 2026-09-07, section 5.3 : "un achat facturé l'augmente").
 * Jamais à la création d'un Bon de commande, qui n'affecte pas le stock
 * (voir schema.ts).
 */
export function incrementerStockAchat(tx: TransactionDrizzle, lignes: LigneAvecProduit[]): Promise<void> {
  return ajusterStock(tx, lignes, 1);
}

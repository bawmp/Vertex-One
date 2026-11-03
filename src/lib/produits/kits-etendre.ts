import { and, eq, inArray } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { composantKit, produit } from "@/db/schema";
import { etendreLignes, type LigneEtendable } from "./kits-regles";

/**
 * Lecture des compositions et expansion des lignes de kits. Séparé de `kits.ts` (gestion) pour que `stock.ts` et `reservations.ts` puissent
 * l'appeler sans import circulaire.
 */

/** Pour les produits donnés qui sont des kits, leurs composants. Un produit qui n'est pas un kit est absent du résultat. */
export async function compositionsDe(tx: TransactionDrizzle, entrepriseId: string, produitIds: string[]): Promise<Map<string, { composantId: string; quantite: number }[]>> {
  const compositions = new Map<string, { composantId: string; quantite: number }[]>();
  if (produitIds.length === 0) return compositions;
  const lignes = await tx
    .select({ kitId: composantKit.kitId, composantId: composantKit.composantId, quantite: composantKit.quantite })
    .from(composantKit)
    .innerJoin(produit, and(eq(composantKit.kitId, produit.id), eq(produit.estKit, true)))
    .where(and(eq(composantKit.entrepriseId, entrepriseId), inArray(composantKit.kitId, produitIds)));
  for (const l of lignes) compositions.set(l.kitId, [...(compositions.get(l.kitId) ?? []), { composantId: l.composantId, quantite: l.quantite }]);
  return compositions;
}

/** Remplace les lignes de kits par leurs composants (ventes, contrôle de rupture, réservations). Les autres lignes ne changent pas. */
export async function etendreKits<L extends LigneEtendable>(tx: TransactionDrizzle, entrepriseId: string, lignes: L[]): Promise<L[]> {
  const ids = [...new Set(lignes.map((l) => l.produitId).filter((id): id is string => Boolean(id)))];
  const compositions = await compositionsDe(tx, entrepriseId, ids);
  return compositions.size === 0 ? lignes : etendreLignes(lignes, compositions);
}

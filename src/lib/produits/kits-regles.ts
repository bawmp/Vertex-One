/**
 * Kits et nomenclatures — règles pures (utilisables dans le navigateur). Un kit est un produit « virtuel » composé d'autres produits : il n'a
 * pas de stock, sa vente sort le stock de ses composants.
 */

export const MAX_COMPOSANTS = 20;
export const MAX_QUANTITE_COMPOSANT = 10_000;

export type ComposantLu = { stockActuel: number; quantite: number; coutMoyen: number };

/** Combien de kits complets le stock des composants permet de vendre : le composant le plus rare décide. Un stock négatif compte pour zéro. */
export function kitsDisponibles(composants: Pick<ComposantLu, "stockActuel" | "quantite">[]): number {
  if (composants.length === 0) return 0;
  return Math.min(...composants.map((c) => Math.max(0, Math.floor(Math.max(c.stockActuel, 0) / c.quantite))));
}

/** Coût de revient d'un kit : somme des coûts moyens de ses composants multipliés par leur quantité. */
export function coutDuKit(composants: Pick<ComposantLu, "coutMoyen" | "quantite">[]): number {
  return composants.reduce((s, c) => s + c.coutMoyen * c.quantite, 0);
}

export type LigneEtendable = { produitId?: string | null; quantite: number };

/**
 * Remplace chaque ligne de kit par les lignes de ses composants (quantité du kit × quantité du composant). Une ligne qui n'est pas un kit
 * passe telle quelle. `compositions` associe l'identifiant d'un kit à ses composants ; un produit absent de la table n'est pas un kit.
 */
export function etendreLignes<L extends LigneEtendable>(lignes: L[], compositions: Map<string, { composantId: string; quantite: number }[]>): L[] {
  const resultat: L[] = [];
  for (const ligne of lignes) {
    const composants = ligne.produitId ? compositions.get(ligne.produitId) : undefined;
    if (!composants) {
      resultat.push(ligne);
      continue;
    }
    for (const c of composants) resultat.push({ ...ligne, produitId: c.composantId, quantite: ligne.quantite * c.quantite, prixUnitaire: undefined } as L);
  }
  return resultat;
}

/** Valide une quantité de composant : entier de 1 à 10 000. */
export function quantiteComposantValide(q: number): boolean {
  return Number.isInteger(q) && q >= 1 && q <= MAX_QUANTITE_COMPOSANT;
}

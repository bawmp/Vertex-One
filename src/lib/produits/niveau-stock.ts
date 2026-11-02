/**
 * Niveau d'un produit suivi, d'après son stock et son seuil d'alerte (règle pure, utilisable dans le navigateur).
 * « RUPTURE » dès que le stock est à 0 ou moins, « BAS » quand il atteint le seuil ou passe en dessous, « OK » sinon.
 * Sans suivi du stock, aucun niveau (null). Une rupture est signalée même sans seuil : zéro en rayon est toujours une alerte.
 */
export type NiveauStock = "OK" | "BAS" | "RUPTURE";

export function niveauStock(produit: { type: string; suiviStock: boolean; stockActuel: number; seuilAlerte: number | null }): NiveauStock | null {
  if (produit.type !== "BIEN" || !produit.suiviStock) return null;
  if (produit.stockActuel <= 0) return "RUPTURE";
  if (produit.seuilAlerte !== null && produit.stockActuel <= produit.seuilAlerte) return "BAS";
  return "OK";
}

/** Vrai pour un produit qui demande un réapprovisionnement (stock bas ou rupture). */
export function aReapprovisionner(produit: Parameters<typeof niveauStock>[0]): boolean {
  const niveau = niveauStock(produit);
  return niveau === "BAS" || niveau === "RUPTURE";
}

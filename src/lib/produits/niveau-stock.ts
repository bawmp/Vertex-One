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

/**
 * Faut-il envoyer une alerte par email ? `precedent` est le dernier niveau déjà signalé (nul si aucun). On alerte quand le produit passe
 * en stock bas ou en rupture, et quand un stock bas devient une rupture ; jamais deux fois pour le même niveau. Le retour à un stock
 * correct réarme l'alerte (voir `niveauApresVerification`).
 */
export function doitAlerter(precedent: string | null, courant: NiveauStock | null): boolean {
  if (courant === "RUPTURE") return precedent !== "RUPTURE";
  if (courant === "BAS") return precedent === null;
  return false;
}

/** Niveau à mémoriser après vérification : le niveau d'alerte actuel, ou rien (nul) quand le stock est redevenu correct. */
export function niveauApresVerification(courant: NiveauStock | null): "BAS" | "RUPTURE" | null {
  return courant === "BAS" || courant === "RUPTURE" ? courant : null;
}

/** Vrai pour un produit qui demande un réapprovisionnement (stock bas ou rupture). */
export function aReapprovisionner(produit: Parameters<typeof niveauStock>[0]): boolean {
  const niveau = niveauStock(produit);
  return niveau === "BAS" || niveau === "RUPTURE";
}

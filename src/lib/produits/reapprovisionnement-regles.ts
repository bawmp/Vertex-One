/**
 * Réapprovisionnement — règle pure (utilisable dans le navigateur). Le stock visé après commande est le « stock cible » du produit, sinon
 * le double de son seuil d'alerte, et toujours au moins une unité de plus que le seuil. La quantité proposée est ce qu'il faut pour
 * l'atteindre, déduction faite de ce qui est déjà commandé (bons de commande en brouillon) ; jamais négative. Un stock négatif
 * (ventes en rupture) se rattrape : il faut aussi couvrir ce qui est dû.
 */
export function stockVise(p: { seuilAlerte: number | null; stockCible: number | null }): number {
  const base = p.stockCible ?? (p.seuilAlerte !== null ? p.seuilAlerte * 2 : 0);
  return Math.max(base, (p.seuilAlerte ?? 0) + 1, 1);
}

export function quantiteSuggeree(p: { stockActuel: number; seuilAlerte: number | null; stockCible: number | null; enCommande: number }): number {
  return Math.max(0, stockVise(p) - p.stockActuel - Math.max(p.enCommande, 0));
}

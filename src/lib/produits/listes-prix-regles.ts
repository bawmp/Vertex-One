/**
 * Listes de prix — règles pures (utilisables dans le navigateur). Une liste applique une remise globale en % au prix de vente du catalogue,
 * sauf pour les produits qui ont un prix fixe dans la liste : le prix fixe l'emporte toujours.
 */

export const MAX_REMISE_POURCENT = 100;
export const MAX_PRIX = 1_000_000_000;

export const nomListeValide = (nom: string) => nom.length >= 2 && nom.length <= 60;
export const remiseValide = (n: number) => Number.isInteger(n) && n >= 0 && n <= MAX_REMISE_POURCENT;
export const prixValide = (n: number) => Number.isInteger(n) && n >= 0 && n <= MAX_PRIX;

/** Prix proposé à un client : prix fixe de la liste, sinon prix du catalogue moins la remise de la liste (arrondi au FCFA), sinon prix du catalogue. */
export function prixPourListe(prixCatalogue: number, liste: { remisePourcent: number } | null, prixFixe: number | null | undefined): number {
  if (!liste) return prixCatalogue;
  if (prixFixe !== null && prixFixe !== undefined) return prixFixe;
  return Math.round((prixCatalogue * (100 - liste.remisePourcent)) / 100);
}

export const nettoyerNomListe = (nom: string) => nom.trim().replace(/\s+/g, " ");

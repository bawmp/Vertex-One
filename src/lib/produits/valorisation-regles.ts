/**
 * Valorisation du stock — règles pures (utilisables dans le navigateur).
 *
 * CMUP (coût moyen pondéré, par défaut) : chaque unité en stock vaut le coût moyen du produit.
 * FIFO (premier entré, premier sorti) : les unités vendues sont les plus anciennes ; celles qui restent sont donc les DERNIÈRES entrées, et
 * valent chacune le coût de l'achat dont elles viennent. Quand les prix d'achat montent, un stock FIFO vaut plus qu'un stock au coût moyen.
 */

export type MethodeValorisation = "CMUP" | "FIFO";

export function methodeValide(valeur: unknown): MethodeValorisation | null {
  return valeur === "CMUP" || valeur === "FIFO" ? valeur : null;
}

/** Une entrée de stock : `quantite` unités arrivées à `cout` FCFA l'unité. */
export type Couche = { quantite: number; cout: number };

/**
 * Valeur de `restant` unités selon le FIFO. `couches` va des plus anciennes aux plus récentes. On prend les unités restantes dans les couches
 * les plus récentes. Si l'historique ne couvre pas tout le stock (stock d'avant le suivi), le surplus — forcément le plus ancien — est valorisé
 * au coût de la plus ancienne couche connue, à défaut au `coutRepli`.
 */
export function valeurFIFO(restant: number, couches: Couche[], coutRepli: number): number {
  if (restant <= 0) return 0;
  let reste = restant;
  let valeur = 0;
  for (let i = couches.length - 1; i >= 0 && reste > 0; i--) {
    const pris = Math.min(couches[i].quantite, reste);
    valeur += pris * couches[i].cout;
    reste -= pris;
  }
  if (reste > 0) valeur += reste * (couches.length > 0 ? couches[0].cout : coutRepli);
  return valeur;
}

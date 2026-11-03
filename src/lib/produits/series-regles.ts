/**
 * Numéros de série — règles pures (utilisables dans le navigateur). Une unité = un numéro, de l'entrée en stock à la vente.
 */

export const MAX_SERIES_PAR_SAISIE = 500;
export const LONGUEUR_MAX_SERIE = 60;

export type StatutSerie = "EN_STOCK" | "VENDU" | "RETIRE";

/** Majuscules, espaces superflus retirés : « sn-001 » et « SN-001 » sont le même numéro. */
export const normaliserSerie = (n: string) => n.trim().replace(/\s+/g, " ").toUpperCase();

export type LectureSeries = { numeros: string[]; doublons: string[]; invalides: string[] };

/**
 * Lit une liste collée ou saisie (un numéro par ligne, ou séparés par virgule ou point-virgule). Les doublons dans la saisie sont écartés
 * et signalés ; un numéro vide ou trop long est invalide.
 */
export function lireSeries(texte: string): LectureSeries {
  const vus = new Set<string>();
  const numeros: string[] = [];
  const doublons: string[] = [];
  const invalides: string[] = [];
  for (const brut of texte.split(/[\n\r,;]+/)) {
    const n = normaliserSerie(brut);
    if (n === "") continue;
    if (n.length > LONGUEUR_MAX_SERIE) {
      invalides.push(n.slice(0, 20) + "…");
      continue;
    }
    if (vus.has(n)) {
      doublons.push(n);
      continue;
    }
    vus.add(n);
    numeros.push(n);
  }
  return { numeros, doublons, invalides };
}

/**
 * Quels numéros en stock une vente de `quantite` unités emporte : les plus anciennement entrés d'abord (puis par numéro, pour un ordre
 * stable). S'il y a moins de numéros que d'unités vendues, le reste est vendu sans numéro.
 */
export function numerosAVendre<T extends { numero: string; entreLe: Date }>(enStock: T[], quantite: number): T[] {
  return [...enStock].sort((a, b) => a.entreLe.getTime() - b.entreLe.getTime() || a.numero.localeCompare(b.numero)).slice(0, Math.max(0, quantite));
}

/** Après une sortie de stock quelconque, combien de numéros « en stock » dépassent le stock réel (à retirer, les plus récents d'abord). */
export const exces = (numerosEnStock: number, stock: number) => Math.max(0, numerosEnStock - Math.max(stock, 0));

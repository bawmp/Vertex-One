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

/**
 * Répartit les numéros vendus d'un document sur ses lignes : chaque ligne d'un produit prend, dans l'ordre, autant de numéros que
 * d'unités vendues (quantité arrondie à l'entier supérieur) ; les numéros en trop restent sur la dernière ligne du produit. Une ligne
 * sans produit, ou d'un produit sans numéro, n'en reçoit aucun.
 */
export function repartirSeries<L extends { produitId: string | null; quantite: number }>(lignes: L[], parProduit: Map<string, string[]>): (L & { series: string[] })[] {
  const restants = new Map([...parProduit].map(([p, s]) => [p, [...s]]));
  const derniere = new Map<string, number>();
  lignes.forEach((l, i) => l.produitId && derniere.set(l.produitId, i));
  return lignes.map((l, i) => {
    const file = l.produitId ? restants.get(l.produitId) : undefined;
    if (!l.produitId || !file || file.length === 0) return { ...l, series: [] };
    const n = i === derniere.get(l.produitId) ? file.length : Math.ceil(l.quantite);
    return { ...l, series: file.splice(0, n) };
  });
}

/** Un numéro vendu peut être remplacé par un numéro en stock du MÊME produit ; jamais par lui-même. */
export function remplacementPossible(vendu: { produitId: string; statut: string }, nouveau: { produitId: string; statut: string; id: string }, venduId: string): boolean {
  return vendu.statut === "VENDU" && nouveau.statut === "EN_STOCK" && vendu.produitId === nouveau.produitId && nouveau.id !== venduId;
}

/* ------------------------------- Garantie ------------------------------- */

export const DUREE_GARANTIE_MAX_MOIS = 120;
export const SEUIL_GARANTIE_BIENTOT_JOURS = 30;

/** Durée de garantie acceptable : un nombre entier de mois, de 1 à 120. */
export const dureeGarantieValide = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= DUREE_GARANTIE_MAX_MOIS;

const jourEnParties = (j: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(j)) return null;
  const [a, m, d] = j.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? { a, m, d } : null;
};
const jourEnNombre = (j: string) => {
  const p = jourEnParties(j)!;
  return Math.round(Date.UTC(p.a, p.m - 1, p.d) / 86_400_000);
};

/** Fin de garantie : le jour de la vente plus `mois` mois (le 31 janvier + 1 mois donne le dernier jour de février). Null si la date ou la durée est invalide. */
export function finGarantie(jourVente: string, mois: number): string | null {
  const p = jourEnParties(jourVente);
  if (!p || !dureeGarantieValide(mois)) return null;
  const total = p.a * 12 + (p.m - 1) + mois;
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const dernier = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${a}-${String(m).padStart(2, "0")}-${String(Math.min(p.d, dernier)).padStart(2, "0")}`;
}

export type EtatGarantie = "ACTIVE" | "BIENTOT" | "EXPIREE";

/** État d'une garantie à une date : expirée si sa fin est passée, « bientôt » dans les 30 derniers jours, sinon active ; null si aucune garantie suivie. */
export function etatGarantie(fin: string | null, aujourdhui: string): EtatGarantie | null {
  if (!fin || !jourEnParties(fin) || !jourEnParties(aujourdhui)) return null;
  const reste = jourEnNombre(fin) - jourEnNombre(aujourdhui);
  if (reste < 0) return "EXPIREE";
  return reste <= SEUIL_GARANTIE_BIENTOT_JOURS ? "BIENTOT" : "ACTIVE";
}

/** Jours restants avant la fin de garantie (négatif si expirée). */
export function joursAvantFinGarantie(fin: string, aujourdhui: string): number | null {
  return jourEnParties(fin) && jourEnParties(aujourdhui) ? jourEnNombre(fin) - jourEnNombre(aujourdhui) : null;
}

/**
 * Numéros emportés par une vente quand la personne en a choisi certains : les numéros choisis d'abord (dans la limite de la quantité vendue),
 * puis les plus anciens en stock pour le reste. Un numéro choisi qui n'est pas en stock est ignoré ici (le contrôle clair est fait avant, à la
 * saisie) : cette règle ne vend jamais un numéro qui n'est pas dans `enStock`.
 */
export function numerosAVendreAvecChoix<T extends { numero: string; entreLe: Date }>(enStock: T[], quantite: number, choisis: string[]): T[] {
  const voulus = new Set(choisis.map(normaliserSerie));
  const pris = enStock.filter((x) => voulus.has(x.numero)).slice(0, Math.max(0, quantite));
  const dejaPris = new Set(pris.map((x) => x.numero));
  return [...pris, ...numerosAVendre(enStock.filter((x) => !dejaPris.has(x.numero)), Math.max(0, quantite) - pris.length)];
}

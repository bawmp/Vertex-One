import { m } from "@/lib/i18n/catalogue";

/**
 * Variantes et conditionnements — règles pures (utilisables dans le navigateur).
 *
 * Variantes : une famille se décline selon 1 à 3 options (Taille, Couleur…), chacune avec ses valeurs ; on crée un produit par combinaison.
 * Conditionnements : « carton = 12 pièces » ; le stock reste compté en unités de base, les conditionnements servent à saisir et à afficher.
 */

export type OptionVariante = { nom: string; valeurs: string[] };

export const MAX_OPTIONS = 3;
export const MAX_VALEURS_PAR_OPTION = 20;
export const MAX_VARIANTES = 100;

const nettoyer = (t: string) => t.trim().replace(/\s+/g, " ");

/** Découpe « S, M, L » (virgules ou points-virgules) en valeurs propres, sans doublon (casse ignorée). */
export function lireValeurs(texte: string): string[] {
  const vues = new Set<string>();
  const valeurs: string[] = [];
  for (const brut of texte.split(/[,;\n]/)) {
    const v = nettoyer(brut);
    if (!v || vues.has(v.toLowerCase())) continue;
    vues.add(v.toLowerCase());
    valeurs.push(v);
  }
  return valeurs;
}

export type ResultatCombinaisons = { ok: true; libelles: string[] } | { ok: false; erreur: string };

/** Toutes les combinaisons (« M / Rouge »), dans l'ordre des options. Les options sans valeur sont ignorées ; au moins une est requise. */
export function combinerOptions(options: OptionVariante[]): ResultatCombinaisons {
  const utiles = options.map((o) => ({ nom: nettoyer(o.nom), valeurs: o.valeurs.map(nettoyer).filter(Boolean) })).filter((o) => o.valeurs.length > 0);
  if (utiles.length === 0) return { ok: false, erreur: m("Indiquez au moins une option avec ses valeurs.") };
  if (utiles.length > MAX_OPTIONS) return { ok: false, erreur: m("Trois options au plus.") };
  if (utiles.some((o) => o.valeurs.length > MAX_VALEURS_PAR_OPTION)) return { ok: false, erreur: m("Vingt valeurs au plus par option.") };
  let total = 1;
  for (const o of utiles) total *= o.valeurs.length;
  if (total > MAX_VARIANTES) return { ok: false, erreur: m("Cent variantes au plus à la fois.") };

  let libelles: string[] = [""];
  for (const o of utiles) libelles = libelles.flatMap((base) => o.valeurs.map((v) => (base ? `${base} / ${v}` : v)));
  return { ok: true, libelles };
}

/** Nom complet d'une variante : « Tee-shirt — M / Rouge ». */
export function nomVariante(nomFamille: string, libelle: string): string {
  return `${nettoyer(nomFamille)} — ${libelle}`;
}

export type Conditionnement = { nom: string; quantiteBase: number };

/** Un conditionnement valide : un nom court et un multiple d'au moins 2 unités de base. */
export function conditionnementValide(nom: string, quantiteBase: number): string | null {
  const n = nettoyer(nom);
  if (n.length < 2 || n.length > 30) return m("Le nom du conditionnement doit faire entre 2 et 30 caractères.");
  if (!Number.isInteger(quantiteBase) || quantiteBase < 2 || quantiteBase > 1_000_000) return m("Un conditionnement contient au moins 2 unités (nombre entier).");
  return null;
}

/**
 * Décompose un stock en conditionnements, du plus grand au plus petit : 27 pièces avec carton (12) → 2 cartons + 3 pièces. Un stock nul ou
 * négatif n'a pas de décomposition. `reste` est exprimé dans l'unité de base.
 */
export function decomposerStock(stock: number, conditionnements: Conditionnement[]): { parts: { nom: string; nombre: number }[]; reste: number } {
  if (stock <= 0) return { parts: [], reste: Math.max(stock, 0) };
  let reste = stock;
  const parts: { nom: string; nombre: number }[] = [];
  for (const c of [...conditionnements].sort((a, b) => b.quantiteBase - a.quantiteBase)) {
    const nombre = Math.floor(reste / c.quantiteBase);
    if (nombre > 0) {
      parts.push({ nom: c.nom, nombre });
      reste -= nombre * c.quantiteBase;
    }
  }
  return { parts, reste };
}

/** Quantité saisie dans une unité (facteur 1 = unité de base) convertie en unités de base ; null si la saisie n'est pas un nombre fini. */
export function versUniteBase(saisie: number, facteur: number): number | null {
  if (!Number.isFinite(saisie) || !Number.isFinite(facteur) || facteur < 1) return null;
  const q = saisie * facteur;
  return Number.isFinite(q) ? q : null;
}

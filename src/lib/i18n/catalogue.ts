import type { Langue } from "@/lib/session";
import { CATALOGUE_EN } from "./catalogue/index";

/**
 * Traduction par phrase : le TEXTE FRANÇAIS est la clé (`t("Nouveau contact")`), l'anglais est cherché dans le catalogue,
 * et tout texte sans traduction reste en français — jamais un écran cassé ni une clé technique affichée. Le français est la
 * langue source du produit ; il n'a donc pas de dictionnaire propre.
 *
 * `t("Bonjour {nom}", { nom })` : `{cle}` est remplacé dans la phrase déjà traduite.
 * `m("À faire")` : marque un texte à traduire PLUS TARD (tables de libellés définies hors composant) — renvoie le texte
 * tel quel ; on le traduit à l'affichage avec `t(libelle)`. Le test `tests/i18n-catalogue.test.ts` lit les littéraux de
 * `t()` et de `m()` et vérifie qu'ils ont tous une traduction anglaise.
 */
export type Traducteur = ((texte: string, valeurs?: Record<string, string | number>) => string) & {
  langue: Langue;
  /** Locale pour `Intl` (dates, nombres) : « fr-FR » ou « en-GB » (jour avant mois, comme en français). */
  locale: string;
};

function interpoler(gabarit: string, valeurs?: Record<string, string | number>): string {
  if (!valeurs) return gabarit;
  return gabarit.replace(/\{(\w+)\}/g, (brut, cle: string) => (cle in valeurs ? String(valeurs[cle]) : brut));
}

export function traducteur(langue: Langue | undefined): Traducteur {
  const courante: Langue = langue === "en" ? "en" : "fr";
  const traduire = (texte: string, valeurs?: Record<string, string | number>) => interpoler(courante === "en" ? (CATALOGUE_EN[texte] ?? texte) : texte, valeurs);
  return Object.assign(traduire, { langue: courante, locale: courante === "en" ? "en-GB" : "fr-FR" });
}

/** Marqueur : renvoie le texte tel quel, pour qu'il soit repéré par le test du catalogue et traduit à l'affichage. */
export function m(texte: string): string {
  return texte;
}

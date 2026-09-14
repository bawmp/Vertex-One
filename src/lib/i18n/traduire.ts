import { fr, en, type Dictionnaire } from "./dictionnaire";
import type { Langue } from "@/lib/session";

function fusionnerProfond<T extends Record<string, unknown>>(base: T, repli: Record<string, unknown>): T {
  const resultat = { ...base } as T;
  for (const cle of Object.keys(repli) as (keyof T)[]) {
    const valeurRepli = repli[cle as string];
    const valeurBase = base[cle];
    if (valeurRepli && typeof valeurRepli === "object" && !Array.isArray(valeurRepli) && valeurBase && typeof valeurBase === "object") {
      resultat[cle] = fusionnerProfond(valeurBase as Record<string, unknown>, valeurRepli as Record<string, unknown>) as T[keyof T];
    } else if (valeurRepli !== undefined) {
      resultat[cle] = valeurRepli as T[keyof T];
    }
  }
  return resultat;
}

/**
 * Retourne le dictionnaire complet pour une langue — toute clé absente du
 * dictionnaire "en" retombe silencieusement sur le texte français (jamais un
 * texte cassé/vide pour un écran pas encore traduit dans cette tranche).
 */
export function traduire(langue: Langue | undefined): Dictionnaire {
  if (langue !== "en") return fr;
  return fusionnerProfond(fr, en);
}

/** Remplace {cle} dans un gabarit par la valeur correspondante — ex. "Bienvenue, {nom}". */
export function interpoler(gabarit: string, valeurs: Record<string, string>): string {
  return gabarit.replace(/\{(\w+)\}/g, (correspondance, cle) => valeurs[cle] ?? correspondance);
}

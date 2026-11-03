import { dateDouala } from "./livres";

/**
 * Exercice comptable (priorité 4.6). Il commence le 1er du mois `moisDebut` (1 = janvier : l'année civile, cas général) et dure douze
 * mois. Il porte le numéro de l'année où il SE TERMINE : avec un début en juillet, l'exercice 2026 va du 01/07/2025 au 30/06/2026.
 */
export const MOIS_DEBUT_DEFAUT = 1;

export function moisDebutValide(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 12;
}

export function periodeExercice(annee: number, moisDebut: number = MOIS_DEBUT_DEFAUT): { du: Date; au: Date } | null {
  if (!Number.isInteger(annee) || annee < 2000 || annee > 2100 || !moisDebutValide(moisDebut)) return null;
  const deux = (n: number) => String(n).padStart(2, "0");
  const anneeDebut = moisDebut === 1 ? annee : annee - 1;
  const moisFin = moisDebut === 1 ? 12 : moisDebut - 1;
  const dernierJour = new Date(Date.UTC(annee, moisFin, 0)).getUTCDate();
  const du = dateDouala(`${anneeDebut}-${deux(moisDebut)}-01`, false);
  const au = dateDouala(`${annee}-${deux(moisFin)}-${deux(dernierJour)}`, true);
  return du && au ? { du, au } : null;
}

/** Numéro de l'exercice qui contient une date (mois de 1 à 12 et année calendaire de cette date, à l'heure de Douala). */
export function anneeExercice(anneeCalendaire: number, mois: number, moisDebut: number = MOIS_DEBUT_DEFAUT): number {
  return moisDebut > 1 && mois >= moisDebut ? anneeCalendaire + 1 : anneeCalendaire;
}

/** « 30/06/2026 » : le dernier jour de l'exercice, pour les textes (jamais « 31/12 » en dur). */
export function finExerciceTexte(annee: number, moisDebut: number = MOIS_DEBUT_DEFAUT): string {
  const p = periodeExercice(annee, moisDebut);
  if (!p) return "";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Douala", day: "2-digit", month: "2-digit", year: "numeric" }).format(p.au);
}

export function debutExerciceTexte(annee: number, moisDebut: number = MOIS_DEBUT_DEFAUT): string {
  const p = periodeExercice(annee, moisDebut);
  if (!p) return "";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Douala", day: "2-digit", month: "2-digit", year: "numeric" }).format(p.du);
}

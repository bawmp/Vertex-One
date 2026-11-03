/**
 * Taux de change : règles pures. Un taux est le nombre de FCFA pour UNE unité de devise étrangère, stocké en millièmes (entier) :
 * EUR à 655,957 se range 655957. La comptabilité reste en FCFA ; ces règles servent à afficher et convertir.
 */
export const TAUX_MAX_MILLIEMES = 1_000_000_000; // un million de FCFA par unité, bien au-delà de toute monnaie réelle

export function normaliserDevise(v: string): string {
  return v.trim().toUpperCase();
}
export function deviseValide(v: string): boolean {
  return /^[A-Z]{3}$/.test(v) && v !== "XAF";
}

/** « 655,957 » ou « 655.957 » → 655957 ; null si ce n'est pas un nombre positif à trois décimales au plus. */
export function lireTaux(texte: string): number | null {
  const t = texte.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
  const milliemes = Math.round(Number(t) * 1000);
  return milliemes >= 1 && milliemes <= TAUX_MAX_MILLIEMES ? milliemes : null;
}

export function formaterTaux(milliemes: number): string {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(milliemes / 1000);
}

/** FCFA → devise, arrondi au centième. */
export function convertirDepuisXaf(montantXaf: number, milliemes: number): number {
  return Math.round((montantXaf * 1000 * 100) / milliemes) / 100;
}
/** Devise → FCFA entier. */
export function convertirVersXaf(montantDevise: number, milliemes: number): number {
  return Math.round((montantDevise * milliemes) / 1000);
}

export function formaterMontantDevise(montant: number, devise: string, locale = "fr-FR"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: devise }).format(montant);
  } catch {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(montant)} ${devise}`;
  }
}

export type TauxLu = { id: string; devise: string; tauxMilliemes: number; dateEffet: string };

/** Taux en vigueur à une date (AAAA-MM-JJ) : le plus récent dont la date d'effet n'est pas postérieure ; null s'il n'y en a pas. */
export function tauxEnVigueur(taux: TauxLu[], devise: string, date: string): TauxLu | null {
  return taux.filter((t) => t.devise === devise && t.dateEffet <= date).sort((a, b) => (a.dateEffet < b.dateEffet ? 1 : -1))[0] ?? null;
}

/** Une date AAAA-MM-JJ réelle (refuse le 31 février). */
export function dateJourValide(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

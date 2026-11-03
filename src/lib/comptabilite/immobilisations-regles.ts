import { m } from "@/lib/i18n/catalogue";
/**
 * Immobilisations — règles pures (utilisables dans le navigateur). Amortissement linéaire, prorata au MOIS : le mois d'acquisition compte
 * en entier. Les dotations sont calculées par différence de cumuls arrondis, donc leur somme vaut exactement la base amortissable.
 */

export type CategorieImmobilisation = { compteActif: string; compteAmortissement: string; libelle: string; dureeConseillee: number };

export const CATEGORIES_IMMOBILISATION: CategorieImmobilisation[] = [
  { compteActif: "244000", compteAmortissement: "284000", libelle: m("Matériel et mobilier"), dureeConseillee: 10 },
  { compteActif: "244100", compteAmortissement: "284100", libelle: m("Matériel informatique"), dureeConseillee: 3 },
  { compteActif: "245000", compteAmortissement: "284500", libelle: m("Matériel de transport"), dureeConseillee: 5 },
  { compteActif: "218000", compteAmortissement: "281800", libelle: m("Autres immobilisations corporelles"), dureeConseillee: 5 },
];

export function categorieImmobilisation(compteActif: string): CategorieImmobilisation | undefined {
  return CATEGORIES_IMMOBILISATION.find((c) => c.compteActif === compteActif);
}

export type BienAmortissable = { valeurAcquisition: number; valeurResiduelle: number; dureeAnnees: number; anneeAcquisition: number; moisAcquisition: number };

export type DotationPrevue = { annee: number; montant: number };

/** Année et mois (1 à 12) d'une date, à l'heure de Douala. */
export function anneeMoisDouala(date: Date): { annee: number; mois: number } {
  const [annee, mois] = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Africa/Douala" }).format(date).split("-").map(Number);
  return { annee, mois };
}

/** Base amortissable, ou null si les données du bien sont invalides. */
export function baseAmortissable(valeurAcquisition: number, valeurResiduelle: number): number | null {
  if (!Number.isInteger(valeurAcquisition) || !Number.isInteger(valeurResiduelle) || valeurAcquisition <= 0 || valeurResiduelle < 0 || valeurResiduelle >= valeurAcquisition) return null;
  return valeurAcquisition - valeurResiduelle;
}

/** Plan complet d'amortissement : une dotation par exercice, de l'année d'acquisition jusqu'à l'amortissement total. */
export function planAmortissement(b: BienAmortissable): DotationPrevue[] {
  const base = baseAmortissable(b.valeurAcquisition, b.valeurResiduelle);
  if (base === null || !Number.isInteger(b.dureeAnnees) || b.dureeAnnees < 1 || b.dureeAnnees > 50 || b.moisAcquisition < 1 || b.moisAcquisition > 12) return [];
  const moisTotal = b.dureeAnnees * 12;
  const plan: DotationPrevue[] = [];
  let cumulPrecedent = 0;
  for (let annee = b.anneeAcquisition; cumulPrecedent < base; annee++) {
    const moisEcoules = Math.min(moisTotal, (annee - b.anneeAcquisition) * 12 + (12 - b.moisAcquisition + 1));
    const cumul = moisEcoules >= moisTotal ? base : Math.round((base * moisEcoules) / moisTotal);
    if (cumul > cumulPrecedent) plan.push({ annee, montant: cumul - cumulPrecedent });
    cumulPrecedent = cumul;
  }
  return plan;
}

export function dotationDeLAnnee(b: BienAmortissable, annee: number): number {
  return planAmortissement(b).find((d) => d.annee === annee)?.montant ?? 0;
}

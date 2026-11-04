import { formaterMontantDevise, formaterTaux } from "./regles";

/** Devises proposées aux sites connectés (2026-11-04). Le XOF est le franc CFA d'Afrique de l'Ouest, à parité 1 pour 1 avec le FCFA (XAF). */
export const DEVISES_FACTURE = ["EUR", "USD", "CAD", "XOF"] as const;
export type DeviseFacture = (typeof DEVISES_FACTURE)[number];

export function deviseFactureValide(v: string): v is DeviseFacture {
  return (DEVISES_FACTURE as readonly string[]).includes(v);
}

/**
 * Taux (en millièmes de FCFA pour une unité de devise) déduit de ce que le client a RÉELLEMENT vu et réglé : le montant en devise et le
 * montant en FCFA. Entier, jamais un nombre à virgule. Nul si l'un des montants n'est pas strictement positif.
 */
export function tauxDepuisMontants(montantFcfa: number, montantDeviseCentimes: number): number | null {
  if (!(montantFcfa > 0) || !(montantDeviseCentimes > 0)) return null;
  const milliemes = Math.round((montantFcfa * 1000 * 100) / montantDeviseCentimes);
  return milliemes >= 1 ? milliemes : null;
}

/**
 * Mention affichée sous le total d'une facture émise dans une autre devise : « Facturé en 80,00 € — taux appliqué : 1 EUR = 655,957 FCFA ».
 * Null pour une facture ordinaire en FCFA. La comptabilité et tous les totaux restent en FCFA ; ceci ne fait qu'informer.
 */
export function mentionDevise(f: { devise: string | null; montantDeviseCentimes: number | null; tauxChangeMilliemes: number | null }): string | null {
  if (!f.devise || f.montantDeviseCentimes == null || f.tauxChangeMilliemes == null) return null;
  return `Facturé en ${formaterMontantDevise(f.montantDeviseCentimes / 100, f.devise)} — taux appliqué : 1 ${f.devise} = ${formaterTaux(f.tauxChangeMilliemes)} FCFA`;
}

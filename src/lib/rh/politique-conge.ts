/**
 * Politiques de congés (échange du 2026-09-08, comparaison avec Zoho
 * People — "Fixed entitlement"/"Experience-based entitlement"). Fonction
 * pure, testable sans base de données : le droit annuel d'une politique
 * FIXE est constant ; celui d'une politique ANCIENNETE ajoute les paliers
 * effectivement atteints (cumulatifs) à la date de référence.
 */

export type PolitiqueCongePourCalcul = {
  type: "FIXE" | "ANCIENNETE";
  joursBaseParAn: number;
};

export type PalierAncienneté = {
  anneesAncienneteMin: number;
  joursSupplementaires: number;
};

function anneesAncienneteEntre(dateEmbauche: Date, dateReference: Date): number {
  let annees = dateReference.getFullYear() - dateEmbauche.getFullYear();
  const anniversaireAtteint =
    dateReference.getMonth() > dateEmbauche.getMonth() ||
    (dateReference.getMonth() === dateEmbauche.getMonth() && dateReference.getDate() >= dateEmbauche.getDate());
  if (!anniversaireAtteint) annees -= 1;
  return Math.max(0, annees);
}

export function calculerDroitAnnuelConge(politique: PolitiqueCongePourCalcul, paliers: PalierAncienneté[], dateEmbauche: Date, dateReference: Date): number {
  if (politique.type === "FIXE") return politique.joursBaseParAn;

  const anciennete = anneesAncienneteEntre(dateEmbauche, dateReference);
  const majoration = paliers.filter((p) => p.anneesAncienneteMin <= anciennete).reduce((total, p) => total + p.joursSupplementaires, 0);
  return politique.joursBaseParAn + majoration;
}

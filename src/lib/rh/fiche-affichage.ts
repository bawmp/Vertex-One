/** Affichage de la fiche collaborateur : petites règles pures (ancienneté, libellés). Sans dépendance serveur. */

import { m, traducteur, type Traducteur } from "@/lib/i18n/catalogue";

export const LIBELLE_CONTRAT: Record<string, string> = { CDI: "CDI", CDD: "CDD", STAGE: m("Stagiaire professionnel"), PRESTATAIRE: m("Prestataire / freelance") };
export const LIBELLE_ROLE: Record<string, string> = { ADMIN: m("Administrateur"), MANAGER: m("Manager"), EMPLOYE: m("Employé") };

/** Ancienneté en clair à partir d'une date d'arrivée : « 2 ans et 3 mois », « 5 mois », « Moins d'un mois ». */
export function ancienneteTexte(depuis: Date, maintenant: Date, t: Traducteur = traducteur("fr")): string {
  if (depuis.getTime() > maintenant.getTime()) return t("Pas encore arrivé(e)");
  let mois = (maintenant.getUTCFullYear() - depuis.getUTCFullYear()) * 12 + (maintenant.getUTCMonth() - depuis.getUTCMonth());
  if (maintenant.getUTCDate() < depuis.getUTCDate()) mois -= 1;
  if (mois < 1) return t("Moins d'un mois");
  const ans = Math.floor(mois / 12);
  const reste = mois % 12;
  const a = ans > 1 ? t("{n} ans", { n: ans }) : ans === 1 ? t("{n} an", { n: ans }) : "";
  const mo = reste > 0 ? t("{n} mois", { n: reste }) : "";
  return a && mo ? t("{a} et {m}", { a, m: mo }) : a || mo;
}

export function libelleStatutTache(statut: string, t: Traducteur = traducteur("fr")): string {
  if (statut === "EN_COURS") return t("En cours");
  if (statut === "A_FAIRE" || statut === "NON_COMMENCEE") return t("À faire");
  if (statut === "DIFFEREE") return t("Différée");
  if (statut === "TERMINEE") return t("Terminée");
  return statut;
}

/** Part de tâches terminées parmi celles qui comptent (en cours + terminées ces 30 jours), en pourcentage entier ; null s'il n'y en a aucune. */
export function tauxTachesTerminees(ouvertes: number, terminees: number): number | null {
  const total = ouvertes + terminees;
  return total === 0 ? null : Math.round((terminees / total) * 100);
}

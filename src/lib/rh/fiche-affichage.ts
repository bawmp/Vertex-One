/** Affichage de la fiche collaborateur : petites règles pures (ancienneté, libellés). Sans dépendance serveur. */

export const LIBELLE_CONTRAT: Record<string, string> = { CDI: "CDI", CDD: "CDD", STAGE: "Stagiaire professionnel", PRESTATAIRE: "Prestataire / freelance" };
export const LIBELLE_ROLE: Record<string, string> = { ADMIN: "Administrateur", MANAGER: "Manager", EMPLOYE: "Employé" };

/** Ancienneté en clair à partir d'une date d'arrivée : « 2 ans et 3 mois », « 5 mois », « Moins d'un mois ». */
export function ancienneteTexte(depuis: Date, maintenant: Date): string {
  if (depuis.getTime() > maintenant.getTime()) return "Pas encore arrivé(e)";
  let mois = (maintenant.getUTCFullYear() - depuis.getUTCFullYear()) * 12 + (maintenant.getUTCMonth() - depuis.getUTCMonth());
  if (maintenant.getUTCDate() < depuis.getUTCDate()) mois -= 1;
  if (mois < 1) return "Moins d'un mois";
  const ans = Math.floor(mois / 12);
  const reste = mois % 12;
  const a = ans > 0 ? `${ans} an${ans > 1 ? "s" : ""}` : "";
  const m = reste > 0 ? `${reste} mois` : "";
  return a && m ? `${a} et ${m}` : a || m;
}

export function libelleStatutTache(statut: string): string {
  if (statut === "EN_COURS") return "En cours";
  if (statut === "A_FAIRE" || statut === "NON_COMMENCEE") return "À faire";
  if (statut === "DIFFEREE") return "Différée";
  if (statut === "TERMINEE") return "Terminée";
  return statut;
}

/** Part de tâches terminées parmi celles qui comptent (en cours + terminées ces 30 jours), en pourcentage entier ; null s'il n'y en a aucune. */
export function tauxTachesTerminees(ouvertes: number, terminees: number): number | null {
  const total = ouvertes + terminees;
  return total === 0 ? null : Math.round((terminees / total) * 100);
}

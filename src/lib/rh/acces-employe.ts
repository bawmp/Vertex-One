/**
 * Dans One People, un Employé (stagiaire et prestataire compris) n'a que sa fiche et ses rapports écrits (2026-11-10). Tickets RH,
 * sondages et rapports statistiques lui sont fermés côté serveur, pas seulement retirés du menu. Le rôle seul décide : une liste de
 * modules choisie par l'Administrateur ne rouvre rien ici.
 */
export function employeLimiteAuRH(utilisateur: { role: string }): boolean {
  return utilisateur.role === "EMPLOYE";
}

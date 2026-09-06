import type { UtilisateurConnecte } from "@/lib/session";

/**
 * Restriction de champ, pas de portée (docs/palier-5-*, section 5) : un
 * Manager qui a par ailleurs VOIR/MODIFIER sur un Dossier RH de son équipe
 * (portée EQUIPE) ne voit pas pour autant le salaire du salarié concerné —
 * seul l'Administrateur et la personne concernée elle-même y accèdent. Même
 * principe que peutVoirDocumentSensible() au Palier 3.
 */
export function peutVoirSalaire(utilisateurConnecte: UtilisateurConnecte, dossierRHUtilisateurId: string): boolean {
  return utilisateurConnecte.role === "ADMIN" || utilisateurConnecte.utilisateurId === dossierRHUtilisateurId;
}

/**
 * Le motif d'une demande de congé maladie est une donnée de santé au sens de
 * la loi camerounaise de protection des données personnelles (docs/palier-5-*,
 * section 7) — même restriction que le salaire, indépendamment du fait que
 * la demande elle-même (dates, statut) reste visible à qui approuve les
 * congés de l'équipe.
 */
export function peutVoirMotifConge(utilisateurConnecte: UtilisateurConnecte, dossierRHUtilisateurId: string, typeConge: string): boolean {
  if (typeConge !== "MALADIE") return true;
  return peutVoirSalaire(utilisateurConnecte, dossierRHUtilisateurId);
}

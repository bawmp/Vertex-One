import type { RoleSysteme } from "@/lib/permissions";

/**
 * Palier 3, section 9 — un document classé PIECE_IDENTITE ou DONNEES_SANTE
 * reste restreint au responsable du Dossier et à l'Administrateur, quel que
 * soit l'accès normal au Dossier/Projet qui le contient. Un Employé qui voit
 * par ailleurs très bien le Dossier de Jean (parce qu'un Projet en cours lui
 * est assigné) ne voit pas nécessairement son passeport.
 */
export function peutVoirDocumentSensible(
  utilisateur: { role: RoleSysteme; utilisateurId: string },
  categorie: string,
  dossierResponsableId: string | null
): boolean {
  if (categorie === "GENERAL") return true;
  return utilisateur.role === "ADMIN" || utilisateur.utilisateurId === dossierResponsableId;
}

export function estCategorieSensible(categorie: string): boolean {
  return categorie === "PIECE_IDENTITE" || categorie === "DONNEES_SANTE";
}

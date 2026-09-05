// Palier 0 — voir docs/palier-0-roles-permissions-specification-technique.md, section 4.
// Matrice définie dans le code, pas éditable par le client en v1.

export type RoleSysteme = "ADMIN" | "MANAGER" | "EMPLOYE" | "CLIENT";
export type Module = "CRM" | "FACTURATION" | "PROJETS" | "DOCUMENTS" | "PARAMETRES";
export type Action = "VOIR" | "CREER" | "MODIFIER" | "SUPPRIMER";
export type Portee = "TOUT" | "EQUIPE" | "PROPRE";

export const MATRICE_PERMISSIONS: Record<RoleSysteme, Record<Module, { actions: Action[]; portee: Portee }>> = {
  ADMIN: {
    CRM: { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
    FACTURATION: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "TOUT" }, // pas de SUPPRIMER — voir CLAUDE.md
    PROJETS: { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
    DOCUMENTS: { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
    PARAMETRES: { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
  },
  MANAGER: {
    CRM: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    FACTURATION: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    PROJETS: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    DOCUMENTS: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    PARAMETRES: { actions: [], portee: "PROPRE" },
  },
  EMPLOYE: {
    CRM: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "PROPRE" },
    FACTURATION: { actions: ["VOIR", "CREER"], portee: "PROPRE" },
    PROJETS: { actions: ["VOIR", "MODIFIER"], portee: "PROPRE" },
    DOCUMENTS: { actions: ["VOIR", "CREER"], portee: "PROPRE" },
    PARAMETRES: { actions: [], portee: "PROPRE" },
  },
  CLIENT: {
    CRM: { actions: [], portee: "PROPRE" },
    FACTURATION: { actions: ["VOIR"], portee: "PROPRE" },
    PROJETS: { actions: ["VOIR"], portee: "PROPRE" },
    DOCUMENTS: { actions: ["VOIR"], portee: "PROPRE" }, // la signature est un droit à part, Palier 4
    PARAMETRES: { actions: [], portee: "PROPRE" },
  },
};

export function peut(role: RoleSysteme, module: Module, action: Action): boolean {
  return MATRICE_PERMISSIONS[role][module].actions.includes(action);
}

export function portee(role: RoleSysteme, module: Module): Portee {
  return MATRICE_PERMISSIONS[role][module].portee;
}

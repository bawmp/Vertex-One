// Palier 0 — voir docs/palier-0-roles-permissions-specification-technique.md, section 4.
// Matrice définie dans le code, pas éditable par le client en v1.

export type RoleSysteme = "ADMIN" | "MANAGER" | "EMPLOYE" | "CLIENT";
export type Module =
  | "CRM"
  | "FACTURATION"
  | "DOSSIERS"
  | "PROJETS"
  | "DOCUMENTS"
  | "MESSAGERIE"
  | "ANNONCES"
  | "SIGNATURE"
  | "CONTRATS"
  | "COMPTABILITE"
  | "ACHATS"
  | "PRODUITS"
  | "RH"
  | "MARKETING"
  | "RESERVATIONS"
  | "RECRUTEMENT"
  | "PARAMETRES";
export type Action = "VOIR" | "CREER" | "MODIFIER" | "SUPPRIMER";
export type Portee = "TOUT" | "EQUIPE" | "PROPRE";

// DOSSIERS et PROJETS sont deux modules distincts (Palier 2, section 5) —
// même portée pour les deux ici, mais évaluée sur des critères différents :
// responsableId pour un Dossier, responsablePrincipalId/Tache.assigneAId
// pour un Projet (voir src/lib/portee.ts, dossiersVisibles()/projetsVisibles()).
export const MATRICE_PERMISSIONS: Record<RoleSysteme, Record<Module, { actions: Action[]; portee: Portee }>> = {
  ADMIN: {
    CRM: { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
    FACTURATION: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "TOUT" }, // pas de SUPPRIMER — voir CLAUDE.md
    DOSSIERS: { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
    PROJETS: { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
    DOCUMENTS: { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
    MESSAGERIE: { actions: ["VOIR", "CREER"], portee: "TOUT" },
    ANNONCES: { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
    SIGNATURE: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "TOUT" },
    CONTRATS: { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
    // Réservé à l'Administrateur seul (docs/palier-4-*, section 5) — une
    // fuite ou une erreur sur les finances de l'entreprise a des
    // conséquences plus larges qu'un dossier client individuel. SUPPRIMER ne
    // s'applique jamais aux factures/écritures elles-mêmes (jamais
    // supprimées, voir CLAUDE.md) mais aux pièces jointes du module
    // Documents financiers (reçus mal téléversés) — droit à l'effacement
    // réel, comme pour Documents (Palier 3).
    COMPTABILITE: { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
    // Cycle Achats (Fournisseurs/Dépenses, inspiré de Zoho Books, échange du
    // 2026-09-06) — même règle que FACTURATION : pas de SUPPRIMER sur une
    // pièce financière déjà enregistrée (voir CLAUDE.md), seul Fournisseur
    // (référentiel, pas une transaction) pourrait l'être un jour.
    ACHATS: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "TOUT" },
    // Référentiel partagé Ventes/Achats (Items chez Zoho Books, échange du
    // 2026-09-07) — portée toujours TOUT, comme Marketing : un catalogue de
    // produits/tarifs s'adresse à toute l'entreprise, pas à un sous-ensemble
    // par utilisateur.
    PRODUITS: { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
    // Portée sur QUEL dossier RH — le salaire reste une restriction de champ
    // à part, vérifiée séparément par peutVoirSalaire() même pour un
    // Manager qui a par ailleurs VOIR/MODIFIER sur le dossier de son équipe
    // (docs/palier-5-*, section 5). Voir src/lib/rh/acces.ts.
    RH: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "TOUT" },
    // Module complémentaire à la carte (disponibleAddon(), pas disponible())
    // — docs/palier-6-*, section 5. Portée toujours TOUT : une campagne
    // s'adresse à un segment de prospects de toute l'entreprise, pas à un
    // sous-ensemble par utilisateur.
    MARKETING: { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
    // Module complémentaire à la carte (disponibleAddon(), comme MARKETING),
    // échange du 2026-09-13. Configuration (services, personnel, disponibilités,
    // paramètres publics) réservée à l'Administrateur via une vérification
    // directe dans les actions serveur, même principe que Shifts/Politiques
    // de congé en RH — MODIFIER est aussi accordé à Manager/Employé ci-dessous
    // mais seulement pour la gestion de leurs propres rendez-vous, jamais la
    // configuration.
    RESERVATIONS: { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
    // Module complémentaire à la carte (échange du 2026-09-13), même
    // principe que RESERVATIONS — configuration (postes, paramètres publics)
    // réservée à l'Administrateur via vérification directe dans les actions
    // serveur, conversion en employé (invitation) également Admin-only.
    RECRUTEMENT: { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
    PARAMETRES: { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
  },
  MANAGER: {
    CRM: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    FACTURATION: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    DOSSIERS: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    PROJETS: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    DOCUMENTS: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    MESSAGERIE: { actions: ["VOIR", "CREER"], portee: "EQUIPE" },
    // Portée TOUT même pour un Manager : "portée toujours TOUT en lecture"
    // pour les annonces (docs/palier-3-*, section 7), seule la création est
    // réservée par rôle, pas la visibilité.
    ANNONCES: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "TOUT" },
    SIGNATURE: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    CONTRATS: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    COMPTABILITE: { actions: [], portee: "PROPRE" },
    ACHATS: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    PRODUITS: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "TOUT" },
    // Un Manager approuve les congés de son équipe et voit ses pointages,
    // mais ne voit jamais le salaire d'un subordonné (restriction de champ,
    // pas de portée — docs/palier-5-*, section 5).
    RH: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    MARKETING: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "TOUT" },
    // Gère ses propres rendez-vous et ceux de son équipe, jamais la
    // configuration (services/personnel/disponibilités), réservée Admin.
    RESERVATIONS: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    // Passe en revue les candidatures de son équipe, jamais la configuration
    // (postes/paramètres publics), réservée Admin.
    RECRUTEMENT: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    PARAMETRES: { actions: [], portee: "PROPRE" },
  },
  EMPLOYE: {
    CRM: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "PROPRE" },
    FACTURATION: { actions: ["VOIR", "CREER"], portee: "PROPRE" },
    DOSSIERS: { actions: ["VOIR", "MODIFIER"], portee: "PROPRE" },
    PROJETS: { actions: ["VOIR", "MODIFIER"], portee: "PROPRE" },
    DOCUMENTS: { actions: ["VOIR", "CREER"], portee: "PROPRE" },
    MESSAGERIE: { actions: ["VOIR", "CREER"], portee: "PROPRE" },
    ANNONCES: { actions: ["VOIR"], portee: "TOUT" }, // lit, ne publie pas
    SIGNATURE: { actions: ["VOIR", "CREER"], portee: "PROPRE" },
    CONTRATS: { actions: ["VOIR"], portee: "PROPRE" },
    COMPTABILITE: { actions: [], portee: "PROPRE" },
    ACHATS: { actions: ["VOIR", "CREER"], portee: "PROPRE" },
    PRODUITS: { actions: ["VOIR"], portee: "TOUT" },
    // Voit son propre dossier RH, demande ses congés, pointe — jamais un
    // dossier collègue (portée PROPRE, pas EQUIPE ici).
    RH: { actions: ["VOIR", "CREER"], portee: "PROPRE" },
    MARKETING: { actions: ["VOIR"], portee: "TOUT" },
    // Voit/annule ses propres rendez-vous, jamais ceux d'un collègue.
    RESERVATIONS: { actions: ["VOIR", "MODIFIER"], portee: "PROPRE" },
    // Voit les candidatures qui lui sont assignées, jamais la configuration.
    RECRUTEMENT: { actions: ["VOIR"], portee: "PROPRE" },
    PARAMETRES: { actions: [], portee: "PROPRE" },
  },
  CLIENT: {
    CRM: { actions: [], portee: "PROPRE" },
    FACTURATION: { actions: ["VOIR"], portee: "PROPRE" },
    DOSSIERS: { actions: ["VOIR"], portee: "PROPRE" },
    PROJETS: { actions: ["VOIR"], portee: "PROPRE" },
    DOCUMENTS: { actions: ["VOIR"], portee: "PROPRE" }, // la signature est un droit à part, Palier 4
    MESSAGERIE: { actions: [], portee: "PROPRE" }, // messagerie interne à l'équipe, pas au client final
    ANNONCES: { actions: [], portee: "PROPRE" },
    // Le client final signe via son jetonAcces (Signataire), avant toute
    // session — VOIR ici couvre la consultation de ses propres demandes une
    // fois connecté au portail, pas le geste de signature lui-même.
    SIGNATURE: { actions: ["VOIR"], portee: "PROPRE" },
    CONTRATS: { actions: ["VOIR"], portee: "PROPRE" },
    COMPTABILITE: { actions: [], portee: "PROPRE" },
    ACHATS: { actions: [], portee: "PROPRE" },
    PRODUITS: { actions: [], portee: "PROPRE" },
    // Un compte CLIENT (portail restreint, Palier 4) n'est jamais un salarié
    // de l'entreprise cliente — pas de Dossier RH pour ce rôle (docs/palier-5-*,
    // section 2).
    RH: { actions: [], portee: "PROPRE" },
    MARKETING: { actions: [], portee: "PROPRE" },
    // Un compte CLIENT (portail restreint) ne gère jamais de rendez-vous
    // depuis /app — le client externe réserve toujours via la page publique
    // /reserver/[slug], sans compte ni session (voir src/app/reserver/).
    RESERVATIONS: { actions: [], portee: "PROPRE" },
    RECRUTEMENT: { actions: [], portee: "PROPRE" },
    PARAMETRES: { actions: [], portee: "PROPRE" },
  },
};

export function peut(role: RoleSysteme, module: Module, action: Action): boolean {
  return MATRICE_PERMISSIONS[role][module].actions.includes(action);
}

export function portee(role: RoleSysteme, module: Module): Portee {
  return MATRICE_PERMISSIONS[role][module].portee;
}

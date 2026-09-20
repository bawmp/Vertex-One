import { MATRICE_PERMISSIONS, type Module, type RoleSysteme } from "@/lib/permissions";

/** Libellés affichés à l'Administrateur quand il choisit les modules d'un collaborateur. */
export const LIBELLES_MODULES: Record<Module, string> = {
  CRM: "One CRM",
  FACTURATION: "One Books — Facturation",
  DOSSIERS: "Dossiers",
  PROJETS: "One Projects",
  DOCUMENTS: "One Docs",
  MESSAGERIE: "One Chat",
  ANNONCES: "One Announcements",
  SIGNATURE: "One Sign",
  CONTRATS: "Contrats",
  COMPTABILITE: "Comptabilité",
  ACHATS: "Achats",
  PRODUITS: "Produits",
  RH: "One People",
  MARKETING: "One Marketing",
  RESERVATIONS: "One Bookings",
  RECRUTEMENT: "One Recruit",
  SUPPORT: "One Desk",
  ONE_FORM: "One Form",
  ONE_VAULT: "One Vault",
  PARAMETRES: "Paramètres",
};

/**
 * Modules dont l'accès peut être retiré à un collaborateur : ceux que son rôle
 * lui donne déjà (VOIR). L'Administrateur ne peut jamais ACCORDER plus que ce
 * que le rôle permet, seulement restreindre. Les Paramètres restent hors liste :
 * ils sont propres à l'Administrateur.
 */
export function modulesRestreignables(role: RoleSysteme): Module[] {
  return (Object.keys(MATRICE_PERMISSIONS[role]) as Module[]).filter((m) => m !== "PARAMETRES" && MATRICE_PERMISSIONS[role][m].actions.includes("VOIR"));
}

/** Un module inconnu ou hors périmètre du rôle est ignoré : jamais de confiance dans une valeur venue du client. */
export function filtrerModulesAutorises(role: RoleSysteme, valeurs: string[]): Module[] {
  const permis = new Set<string>(modulesRestreignables(role));
  return valeurs.filter((v): v is Module => permis.has(v));
}

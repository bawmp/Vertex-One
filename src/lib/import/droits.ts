import { peut } from "@/lib/permissions";
import type { UtilisateurConnecte } from "@/lib/session";
import { DEFINITIONS, TYPES_IMPORT, type TypeImport } from "./definitions";

/** Raison du refus, ou null si l'importation est permise : rôle exigé, puis droit de création sur le module visé. */
export function refusImport(utilisateurConnecte: UtilisateurConnecte, type: TypeImport): string | null {
  const def = DEFINITIONS[type];
  if (def.adminSeulement && utilisateurConnecte.role !== "ADMIN") return "Seul l'Administrateur peut importer ce type de données.";
  if (!peut(utilisateurConnecte, def.module, "CREER")) return `Vous n'avez pas le droit de créer des données dans ce module (${def.libelle}).`;
  return null;
}

export function typesImportables(utilisateurConnecte: UtilisateurConnecte): TypeImport[] {
  return TYPES_IMPORT.filter((type) => refusImport(utilisateurConnecte, type) === null);
}

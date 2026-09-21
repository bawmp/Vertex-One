import { peut } from "@/lib/permissions";
import type { UtilisateurConnecte } from "@/lib/session";
import { traducteur, type Traducteur } from "@/lib/i18n/catalogue";
import { DEFINITIONS, TYPES_IMPORT, type TypeImport } from "./definitions";

/** Raison du refus (dans la langue de `t`), ou null si l'importation est permise : rôle exigé, puis droit de création sur le module visé. */
export function refusImport(utilisateurConnecte: UtilisateurConnecte, type: TypeImport, t: Traducteur = traducteur("fr")): string | null {
  const def = DEFINITIONS[type];
  if (def.adminSeulement && utilisateurConnecte.role !== "ADMIN") return t("Seul l'Administrateur peut importer ce type de données.");
  if (!peut(utilisateurConnecte, def.module, "CREER")) return t("Vous n'avez pas le droit de créer des données dans ce module ({module}).", { module: t(def.libelle) });
  return null;
}

export function typesImportables(utilisateurConnecte: UtilisateurConnecte): TypeImport[] {
  return TYPES_IMPORT.filter((type) => refusImport(utilisateurConnecte, type) === null);
}

/**
 * Catalogue anglais : un fichier par domaine, fusionnés ici. Clé = texte français EXACT tel qu'écrit dans `t("…")`.
 * Chaque fichier ne contient que des paires { "français": "English" }.
 */
import { COMMUN } from "./commun";
import { CRM } from "./crm";
import { APPLICATION } from "./application";
import { VENTES } from "./ventes";
import { COLLABORATION } from "./collaboration";
import { PARAMETRES } from "./parametres";
import { PHRASES } from "./phrases";
import { IMPORT_DONNEES } from "./import-donnees";
import { STATUTS } from "./statuts";
import { MENU } from "./menu";
import { MESSAGES } from "./messages";
import { VITRINE } from "./vitrine";
import { VITRINE_MODULES } from "./vitrine-modules";

export const CATALOGUE_EN: Record<string, string> = {
  ...COMMUN,
  ...CRM,
  ...APPLICATION,
  ...VENTES,
  ...COLLABORATION,
  ...PARAMETRES,
  ...PHRASES,
  ...IMPORT_DONNEES,
  ...STATUTS,
  ...MENU,
  ...MESSAGES,
  ...VITRINE,
  ...VITRINE_MODULES,
};

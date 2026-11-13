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
import { FORMULAIRES } from "./formulaires";
import { STOCK } from "./stock";
import { AVOIRS } from "./avoirs";
import { COMPTABILITE } from "./comptabilite";
import { ANALYTIQUE } from "./analytique";
import { RH } from "./rh";
import { BOUTIQUE_STOCK } from "./boutique-stock";
import { BOUTIQUE_CONNEXION } from "./boutique-connexion";

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
  ...FORMULAIRES,
  ...STOCK,
  ...AVOIRS,
  ...COMPTABILITE,
  ...ANALYTIQUE,
  ...RH,
  ...BOUTIQUE_STOCK,
  ...BOUTIQUE_CONNEXION,
};

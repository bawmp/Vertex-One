import type { Dictionnaire } from "./dictionnaire";

/**
 * Traduction des libellés de premier niveau et des catégories de la sidebar
 * (Tranche 2) — table de correspondance plutôt que de réécrire MODULES_MENU
 * (src/app/app/layout.tsx) en clés : les libellés français restent la source
 * de vérité (utilisés tels quels si la langue est "fr" ou si une entrée est
 * absente de cette table), l'anglais est une couche de présentation
 * appliquée au rendu uniquement. Isolé de layout.tsx (composant serveur qui
 * importe db/session) pour rester importable depuis un composant client
 * (ex. /app/mon-compte, réordonnancement personnel) sans embarquer de code
 * serveur dans le bundle client.
 */
const CLES_NAV_PAR_LIBELLE: Record<string, Exclude<keyof Dictionnaire["nav"], "categories">> = {
  CRM: "crm",
  FACO: "faco",
  Projets: "projets",
  Documents: "documents",
  Messagerie: "messagerie",
  Annonces: "annonces",
  Signatures: "signatures",
  "Ressources Humaines": "rh",
  Marketing: "marketing",
  Réservations: "reservations",
  Recrutement: "recrutement",
  "Assistance client": "support",
  Paramètres: "parametres",
  "Mon compte": "monCompte",
};

const CLES_CATEGORIE_PAR_LIBELLE: Record<string, keyof Dictionnaire["nav"]["categories"]> = {
  Articles: "articles",
  Ventes: "ventes",
  Achats: "achats",
  "Suivi des heures": "suiviHeures",
  Banque: "banque",
  Comptable: "comptable",
  Rapports: "rapports",
  Documents: "documentsFinanciers",
  Présence: "presence",
  Congés: "conges",
  Assistance: "assistance",
  Sondages: "sondages",
};

export function traduireNav(libelle: string, t: Dictionnaire): string {
  const cle = CLES_NAV_PAR_LIBELLE[libelle];
  return cle ? t.nav[cle] : libelle;
}

export function traduireCategorie(categorie: string, t: Dictionnaire): string {
  const cle = CLES_CATEGORIE_PAR_LIBELLE[categorie];
  return cle ? t.nav.categories[cle] : categorie;
}

/**
 * Réordonnancement personnel de la sidebar (Tranche 3) — Array.prototype.sort
 * est stable (garanti depuis ES2019) : deux entrées absentes de `ordre`
 * (indexOf === -1) gardent leur ordre relatif d'origine, toujours en fin de
 * liste. Utilisé à la fois par la sidebar (src/app/app/layout.tsx) et par
 * /app/mon-compte (état initial de la liste réordonnable).
 */
export function ordonnerParPreference(libelles: string[], ordre: string[] | null | undefined): string[] {
  if (!ordre) return libelles;
  return [...libelles].sort((a, b) => {
    const iA = ordre.indexOf(a);
    const iB = ordre.indexOf(b);
    if (iA === -1 && iB === -1) return 0;
    if (iA === -1) return 1;
    if (iB === -1) return -1;
    return iA - iB;
  });
}

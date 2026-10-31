/**
 * Origine d'une inscription (2026-10-31) — logique pure (navigateur ET serveur), sans « server-only ».
 *
 * Un lien de campagne porte sa provenance : `?utm_source=facebook&utm_medium=pub&utm_campaign=mobilite-nov`, ou un parrainage
 * `?ref=CODE`. Le navigateur la mémorise dans un cookie (premier contact, 60 jours : un visiteur qui revient directement quelques
 * jours plus tard reste attribué à la campagne qui l'a amené) ; l'inscription la lit côté serveur et la range sur l'entreprise.
 *
 * Tout ce qui arrive du navigateur est NETTOYÉ ici (minuscules, a-z 0-9 _ . - seulement, 60 caractères) : c'est une donnée de suivi
 * commercial, jamais un droit d'accès, mais elle ne doit jamais pouvoir injecter autre chose que du texte inoffensif.
 */
export const COOKIE_ORIGINE = "vertexone-origine";
export const DUREE_COOKIE_ORIGINE_JOURS = 60;

export type Origine = {
  /** « facebook », « parrainage », « reseau », « google », « whatsapp », « direct »… */
  source: string;
  /** Le support : « pub », « post », « email »… */
  support: string | null;
  /** La campagne : « mobilite-nov »… */
  campagne: string | null;
  /** Le code de parrainage (`?ref=`), jamais une donnée personnelle. */
  parrain: string | null;
};

export const ORIGINE_DIRECTE: Origine = { source: "direct", support: null, campagne: null, parrain: null };

/** Minuscules, caractères sûrs seulement, longueur bornée ; null si rien d'exploitable. */
export function nettoyerOrigine(valeur: unknown, max = 60): string | null {
  if (typeof valeur !== "string") return null;
  const propre = valeur
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, max);
  return propre.length > 0 ? propre : null;
}

const SOURCES_PAR_HOTE: [RegExp, string][] = [
  [/(^|\.)(facebook|fb|instagram|messenger)\.(com|me)$/, "facebook"],
  [/(^|\.)google\./, "google"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "whatsapp"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)(tiktok\.com)$/, "tiktok"],
];

/**
 * Lit l'origine dans l'adresse de la page (`window.location.search`) et le référent. `explicite` vaut vrai quand le lien portait des
 * paramètres de campagne : une origine explicite remplace celle déjà mémorisée, un simple référent ne la remplace jamais.
 */
export function origineDepuisNavigation(recherche: string, referent: string, hoteSite: string): { origine: Origine; explicite: boolean } {
  const params = new URLSearchParams(recherche);
  const premier = (...noms: string[]) => noms.map((n) => nettoyerOrigine(params.get(n))).find((v) => v !== null) ?? null;

  const source = premier("utm_source", "src", "source");
  const support = premier("utm_medium", "medium");
  const campagne = premier("utm_campaign", "campagne");
  const parrain = premier("ref", "parrain");

  if (source || support || campagne || parrain) {
    return { origine: { source: source ?? (parrain ? "parrainage" : "direct"), support, campagne, parrain }, explicite: true };
  }

  let hote = "";
  try {
    hote = referent ? new URL(referent).hostname.toLowerCase() : "";
  } catch {
    hote = "";
  }
  if (!hote) return { origine: ORIGINE_DIRECTE, explicite: false };
  if (hote === hoteSite.toLowerCase()) return { origine: ORIGINE_DIRECTE, explicite: false };
  const connue = SOURCES_PAR_HOTE.find(([motif]) => motif.test(hote));
  return { origine: { ...ORIGINE_DIRECTE, source: connue ? connue[1] : "autre" }, explicite: false };
}

/** Valeur du cookie : quatre champs séparés par « | » (vides quand absents). Les champs sont déjà nettoyés : aucun « | » possible. */
export function serialiserOrigine(o: Origine): string {
  return [o.source, o.support ?? "", o.campagne ?? "", o.parrain ?? ""].join("|");
}

/** Relit le cookie, en re-nettoyant chaque champ (le cookie vient du navigateur : jamais cru tel quel). null si illisible. */
export function lireOrigine(valeur: string | null | undefined): Origine | null {
  if (!valeur) return null;
  let brut = valeur;
  try {
    brut = decodeURIComponent(valeur);
  } catch {
    /* valeur non encodée : on la prend telle quelle, elle sera nettoyée */
  }
  const [source, support, campagne, parrain] = brut.split("|");
  const nettoyee = nettoyerOrigine(source);
  if (!nettoyee) return null;
  return { source: nettoyee, support: nettoyerOrigine(support), campagne: nettoyerOrigine(campagne), parrain: nettoyerOrigine(parrain) };
}

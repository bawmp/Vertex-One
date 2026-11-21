import { m } from "@/lib/i18n/catalogue";
import { lirePrixDevise } from "@/lib/devises/facture";
import { convertirVersXaf } from "@/lib/devises/regles";

/**
 * Demande de révision d'un devis par le client : il doit AVANCER DES ARGUMENTS — au moins 3, chacun rédigé en phrase complète et
 * différent des autres, jamais une demande vide ou un simple « trop cher ». Règles pures (navigateur ET serveur : le serveur ne croit
 * jamais ce que le navigateur a déjà vérifié). La pertinence au fond reste jugée par l'équipe : on écarte seulement ce qui n'est
 * manifestement pas un argument (trop court, répété, suite de caractères identiques).
 */
export const ARGUMENTS_MIN = 3;
export const ARGUMENTS_MAX = 6;
export const ARGUMENT_LONGUEUR_MIN = 15;
export const ARGUMENT_LONGUEUR_MAX = 500;
export const ARGUMENT_MOTS_MIN = 3;

/** Espaces et retours à la ligne ramenés à un espace, bornes coupées ; les arguments vides disparaissent. */
export function nettoyerArguments(bruts: unknown): string[] {
  if (!Array.isArray(bruts)) return [];
  return bruts
    .map((a) => String(a ?? "").replace(/\s+/g, " ").trim().slice(0, ARGUMENT_LONGUEUR_MAX))
    .filter((a) => a.length > 0)
    .slice(0, ARGUMENTS_MAX + 1);
}

const nombreDeMots = (a: string) => a.split(" ").filter((mot) => mot.replace(/[^\p{L}\p{N}]/gu, "").length > 0).length;
const sansAccent = (a: string) => a.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Clé française de l'erreur si les arguments sont insuffisants, sinon null. Le paramètre est la liste DÉJÀ nettoyée. */
export function erreurArguments(arguments_: string[]): string | null {
  if (arguments_.length < ARGUMENTS_MIN) return m("Avancez au moins 3 arguments pour demander la révision de ce devis.");
  if (arguments_.length > ARGUMENTS_MAX) return m("Six arguments au plus : gardez les plus importants.");
  if (arguments_.some((a) => a.length < ARGUMENT_LONGUEUR_MIN || nombreDeMots(a) < ARGUMENT_MOTS_MIN || /(.)\1{5,}/u.test(a))) {
    return m("Chaque argument doit être une phrase complète (15 caractères et 3 mots au moins).");
  }
  if (new Set(arguments_.map(sansAccent)).size < arguments_.length) return m("Vos arguments doivent être différents les uns des autres.");
  return null;
}

/** Les arguments sont rangés dans une seule colonne texte, un par ligne (jamais de retour à la ligne dans un argument). */
export const argumentsVersTexte = (liste: string[]) => liste.join("\n");
export const texteVersArguments = (texte: string) => texte.split("\n").map((l) => l.trim()).filter(Boolean);

export const CONDITIONS_LONGUEUR_MAX = 500;

export type ContreProposition = { montant: number | null; conditions: string | null };

/**
 * Contre-proposition facultative du client, avancée avec ses arguments : un montant TTC (dans la devise du devis s'il en a une,
 * converti au taux figé du devis relu en base, jamais un taux du navigateur) et/ou d'autres conditions (délai, paiement…). Le montant
 * doit être positif et INFÉRIEUR au montant actuel du devis : demander plus que l'offre n'a pas de sens (une prestation en plus
 * s'écrit dans les arguments). Renvoie la clé française de l'erreur, ou la contre-proposition (champs nuls si rien n'est saisi).
 */
export function lireContreProposition(
  montantBrut: unknown,
  conditionsBrutes: unknown,
  devis: { montantTTC: number; devise: string | null; tauxChangeMilliemes: number | null },
): { erreur: string } | ContreProposition {
  const texte = String(montantBrut ?? "").trim();
  const conditions = String(conditionsBrutes ?? "").replace(/\s+/g, " ").trim().slice(0, CONDITIONS_LONGUEUR_MAX) || null;
  if (!texte) return { montant: null, conditions };
  let montant: number;
  if (devis.devise && devis.tauxChangeMilliemes) {
    const prix = lirePrixDevise(texte);
    if (prix === null) return { erreur: m("Montant invalide : deux décimales au plus.") };
    montant = convertirVersXaf(prix, devis.tauxChangeMilliemes);
  } else {
    const net = texte.replace(/[\s\u00a0\u202f]/g, "");
    if (!/^\d{1,12}$/.test(net)) return { erreur: m("Montant invalide : un nombre entier, sans décimales.") };
    montant = Number(net);
  }
  if (montant <= 0 || montant >= devis.montantTTC) return { erreur: m("Votre montant doit être supérieur à 0 et inférieur au montant actuel du devis.") };
  return { montant, conditions };
}

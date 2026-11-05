import { m } from "@/lib/i18n/catalogue";

/** Tâches du poste : règles pures (sans accès base), utilisables dans le navigateur. */
export const FREQUENCES = ["PERMANENTE", "QUOTIDIENNE", "HEBDOMADAIRE", "MENSUELLE", "TRIMESTRIELLE", "ANNUELLE"] as const;
export type FrequenceTache = (typeof FREQUENCES)[number];
export const LIBELLE_FREQUENCE: Record<FrequenceTache, string> = {
  PERMANENTE: m("En continu"),
  QUOTIDIENNE: m("Chaque jour"),
  HEBDOMADAIRE: m("Chaque semaine"),
  MENSUELLE: m("Chaque mois"),
  TRIMESTRIELLE: m("Chaque trimestre"),
  ANNUELLE: m("Chaque année"),
};
export const MAX_TACHES_POSTE = 30;

export type SaisieTachePoste = { titre: string; description: string; frequence: string };
export type TachePosteLue = { id: string; titre: string; description: string | null; frequence: FrequenceTache; creeLe: Date };

/** Règle pure : valide et nettoie la saisie ; les messages sont des clés traduites par l'appelant. */
export function validerTachePoste(s: SaisieTachePoste): { ok: true; valeurs: { titre: string; description: string | null; frequence: FrequenceTache } } | { ok: false; erreur: string } {
  const titre = s.titre.replace(/\s+/g, " ").trim();
  if (titre.length < 3) return { ok: false, erreur: m("Donnez un titre d'au moins 3 caractères à la tâche.") };
  if (titre.length > 120) return { ok: false, erreur: m("Le titre est limité à 120 caractères.") };
  const description = s.description.trim();
  if (description.length > 600) return { ok: false, erreur: m("La description est limitée à 600 caractères.") };
  if (!(FREQUENCES as readonly string[]).includes(s.frequence)) return { ok: false, erreur: m("Fréquence inconnue.") };
  return { ok: true, valeurs: { titre, description: description || null, frequence: s.frequence as FrequenceTache } };
}

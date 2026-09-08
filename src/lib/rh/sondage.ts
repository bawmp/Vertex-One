/**
 * Sondages d'engagement (échange du 2026-09-08, comparaison avec Zoho
 * People — eNPS/Pulse). Fonctions pures, testables sans base de données :
 * agrègent des valeurs déjà lues en base (jamais d'identité liée, voir
 * schema.ts, sondageReponse).
 */

// En dessous de ce nombre de réponses, un résultat agrégé n'est jamais
// affiché — avec 1 ou 2 répondants sur une petite équipe, la réponse
// resterait identifiable par élimination malgré l'anonymat structurel de
// la table. Seuil arbitraire mais standard pour ce type d'outil.
export const SEUIL_MIN_PARTICIPANTS_POUR_RESULTATS = 3;

export type ResultatQuestionNPS = { type: "NPS"; scoreENPS: number; nombreReponses: number };
export type ResultatQuestionEtoiles = { type: "ETOILES"; moyenne: number; nombreReponses: number };
export type ResultatQuestionTexte = { type: "TEXTE"; reponses: string[] };
export type ResultatQuestion = ResultatQuestionNPS | ResultatQuestionEtoiles | ResultatQuestionTexte;

/**
 * eNPS = %Promoteurs (9-10) - %Détracteurs (0-6), formule standard du Net
 * Promoter Score — jamais une simple moyenne, qui donnerait un chiffre
 * différent et trompeur pour qui connaît la méthodologie NPS.
 */
export function calculerResultatsQuestion(type: "NPS" | "ETOILES" | "TEXTE", valeurs: string[]): ResultatQuestion {
  if (type === "TEXTE") return { type: "TEXTE", reponses: valeurs };

  const nombres = valeurs.map(Number).filter((n) => Number.isFinite(n));

  if (type === "NPS") {
    const promoteurs = nombres.filter((n) => n >= 9).length;
    const detracteurs = nombres.filter((n) => n <= 6).length;
    const scoreENPS = nombres.length > 0 ? Math.round(((promoteurs - detracteurs) / nombres.length) * 100) : 0;
    return { type: "NPS", scoreENPS, nombreReponses: nombres.length };
  }

  const moyenne = nombres.length > 0 ? nombres.reduce((total, n) => total + n, 0) / nombres.length : 0;
  return { type: "ETOILES", moyenne: Math.round(moyenne * 10) / 10, nombreReponses: nombres.length };
}

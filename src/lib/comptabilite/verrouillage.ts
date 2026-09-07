/**
 * Verrouillage de transactions (Zoho Books > Comptable, échange du
 * 2026-09-07) — aucune écriture comptable ne doit pouvoir être datée à la
 * date de verrouillage ou avant. Fonction pure, réutilisée à la fois par
 * creerEcritures() (garde-fou pour toute écriture générée, Ventes/Achats/
 * Journaux manuels confondus — voir src/lib/comptabilite/ecritures.ts) et
 * par creerJournalManuel() (message d'erreur convivial avant même de
 * tenter l'écriture, plutôt que de laisser remonter l'exception).
 */
export function verifierDateNonVerrouillee(dateVerrouillageComptable: Date | null, date: Date): string | null {
  if (!dateVerrouillageComptable) return null;
  if (date.getTime() > dateVerrouillageComptable.getTime()) return null;

  const formateur = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });
  return `La comptabilité est verrouillée jusqu'au ${formateur.format(dateVerrouillageComptable)} inclus — impossible d'enregistrer une écriture à cette date.`;
}

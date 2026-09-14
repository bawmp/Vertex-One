/**
 * Détecte une violation de la contrainte d'unicité globale sur
 * utilisateur.email (voir src/db/schema.ts, "utilisateur_email_unique" —
 * corrigé le 2026-09-14 depuis une contrainte composite par entreprise qui
 * permettait à une même adresse de s'inscrire dans plusieurs entreprises et
 * cassait ensuite la connexion Better-Auth, celle-ci authentifiant par
 * email seul). Le nom de la contrainte peut apparaître soit directement
 * dans le message de l'erreur Drizzle, soit dans erreur.cause.message (le
 * pilote pg sous-jacent) selon le point d'échec — on vérifie les deux
 * plutôt que de supposer lequel s'applique.
 */
export function contientContrainteEmailUnique(erreur: unknown): boolean {
  if (!(erreur instanceof Error)) return false;
  const cause = (erreur as Error & { cause?: unknown }).cause;
  const messageCause = cause instanceof Error ? cause.message : "";
  return erreur.message.includes("utilisateur_email_unique") || messageCause.includes("utilisateur_email_unique");
}

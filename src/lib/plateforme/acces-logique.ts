/**
 * Console interne plateforme (2026-09-14) — logique pure de la liste blanche
 * de staff, isolée pour rester testable directement en Vitest (pas de
 * "server-only", même patron que src/lib/abonnement/etat.ts).
 */
export type NiveauPlateforme = "PROPRIETAIRE" | "EQUIPE";

/**
 * Niveau d'accès à la console : PROPRIETAIRE pour un email de la liste blanche (PLATEFORME_ADMINS, variable d'environnement : seul qui contrôle
 * Vercel la modifie), EQUIPE pour un collaborateur ajouté dans la console par un propriétaire et non révoqué, sinon aucun accès.
 */
export function niveauPlateforme(email: string | null | undefined, allowlist: string | undefined, membresActifs: readonly string[]): NiveauPlateforme | null {
  if (!email) return null;
  if (estEmailStaff(email, allowlist)) return "PROPRIETAIRE";
  const normalise = email.trim().toLowerCase();
  return membresActifs.some((m) => m.trim().toLowerCase() === normalise) ? "EQUIPE" : null;
}

export function estEmailStaff(email: string | null | undefined, allowlist: string | undefined): boolean {
  if (!email) return false;
  const emails = (allowlist ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return emails.includes(email.trim().toLowerCase());
}

/**
 * Console interne plateforme (2026-09-14) — logique pure de la liste blanche
 * de staff, isolée pour rester testable directement en Vitest (pas de
 * "server-only", même patron que src/lib/abonnement/etat.ts).
 */
export function estEmailStaff(email: string | null | undefined, allowlist: string | undefined): boolean {
  if (!email) return false;
  const emails = (allowlist ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return emails.includes(email.trim().toLowerCase());
}

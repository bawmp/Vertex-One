import type { UtilisateurConnecte } from "@/lib/session";

/**
 * Assistance RH interne (échange du 2026-09-08, comparaison avec Zoho
 * People — "HR Help Desk") : le demandeur, l'agent assigné, ou
 * l'Administrateur — jamais la portée RH normale d'un Manager, un ticket
 * pouvant être assigné à n'importe quel agent désigné (voir schema.ts,
 * ticketRH).
 */
export function peutVoirTicket(utilisateurConnecte: UtilisateurConnecte, ticket: { demandeurId: string; assigneAId: string | null }): boolean {
  return utilisateurConnecte.role === "ADMIN" || utilisateurConnecte.utilisateurId === ticket.demandeurId || utilisateurConnecte.utilisateurId === ticket.assigneAId;
}

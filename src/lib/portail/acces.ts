import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { contact } from "@/db/schema";
import type { UtilisateurConnecte } from "@/lib/session";

/**
 * Résout le Contact CRM lié au compte portail connecté (role CLIENT) — voir
 * contact.utilisateurId, src/db/schema.ts. Retourne null si ce compte
 * CLIENT n'a jamais été lié à un Contact (ne devrait pas arriver en usage
 * normal, seulement si l'invitation d'origine n'avait pas de contactId).
 */
export async function resoudreMonContact(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte): Promise<{ id: string; nom: string } | null> {
  const [monContact] = await tx.select({ id: contact.id, nom: contact.nom }).from(contact).where(eq(contact.utilisateurId, utilisateurConnecte.utilisateurId));
  return monContact ?? null;
}

/**
 * Assistance client (échange du 2026-09-13, comparaison avec Zoho Desk) :
 * l'Administrateur, l'agent assigné, OU le Contact demandeur lui-même
 * (jamais la portée SUPPORT normale d'un Manager) — miroir de
 * peutVoirTicket() (src/lib/rh/ticket.ts), adapté pour un demandeur Contact
 * plutôt qu'un utilisateur interne.
 */
export function peutVoirTicketSupport(
  utilisateurConnecte: UtilisateurConnecte,
  monContactId: string | null,
  ticket: { contactId: string; assigneAId: string | null }
): boolean {
  return utilisateurConnecte.role === "ADMIN" || utilisateurConnecte.utilisateurId === ticket.assigneAId || (monContactId !== null && monContactId === ticket.contactId);
}

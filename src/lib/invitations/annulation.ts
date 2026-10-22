import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { candidature, invitation } from "@/db/schema";
import type { TransactionDrizzle } from "@/db/client";

/**
 * Annule des invitations NON utilisées (2026-10-22) : elles sont supprimées, sauf celles qu'une candidature référence
 * (conversion en embauche) — celles-là sont seulement périmées, pour ne pas casser la clé étrangère. Un lien annulé
 * ne permet plus jamais de créer un compte. Une invitation déjà utilisée n'est jamais touchée ici.
 */
export async function annulerInvitationsNonUtilisees(tx: TransactionDrizzle, entrepriseId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const cibles = and(eq(invitation.entrepriseId, entrepriseId), inArray(invitation.id, ids), isNull(invitation.utiliseeLe));
  const referencees = await tx.select({ id: candidature.invitationId }).from(candidature).where(and(eq(candidature.entrepriseId, entrepriseId), inArray(candidature.invitationId, ids)));
  const idsReferences = referencees.map((r) => r.id).filter((x): x is string => !!x);
  if (idsReferences.length > 0) {
    await tx.update(invitation).set({ expireLe: sql`now() - interval '1 second'` }).where(and(cibles, inArray(invitation.id, idsReferences)));
  }
  const aSupprimer = ids.filter((i) => !idsReferences.includes(i));
  if (aSupprimer.length > 0) {
    await tx.delete(invitation).where(and(eq(invitation.entrepriseId, entrepriseId), inArray(invitation.id, aSupprimer), isNull(invitation.utiliseeLe)));
  }
}

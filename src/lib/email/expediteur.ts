import { and, eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { entreprise, utilisateur } from "@/db/schema";

/**
 * Qui écrit, du point de vue du client : le nom de l'entreprise comme expéditeur affiché, et l'adresse de la
 * personne connectée en « répondre à » (la réponse du client lui arrive directement). Lecture dans la transaction
 * de l'appelant ; `utilisateur` est en RLS permissive, donc l'entreprise est filtrée explicitement.
 */
export async function expediteurDe(tx: TransactionDrizzle, utilisateurConnecte: { utilisateurId: string; entrepriseId: string }) {
  const [ent] = await tx.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
  const [moi] = await tx
    .select({ email: utilisateur.email })
    .from(utilisateur)
    .where(and(eq(utilisateur.id, utilisateurConnecte.utilisateurId), eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId)));
  return { nomExpediteur: ent?.nom, replyTo: moi?.email };
}

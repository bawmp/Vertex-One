import { and, eq, isNull } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { invitation, utilisateur } from "@/db/schema";
import { annulerInvitationsNonUtilisees } from "@/lib/invitations/annulation";

/**
 * Retire l'accès d'un compte, en base seulement (la ligne `utilisateur` reste, statut SUPPRIME : ses documents, tâches et messages gardent leur
 * auteur). Partagé entre « Supprimer » de Paramètres → Équipe (qui garde la fiche RH) et « Supprimer la fiche » de la fiche RH (qui l'efface).
 *
 * - ses invitations restées sans suite sont annulées (le lien ne doit plus rien permettre) ;
 * - ceux qu'il encadrait n'ont plus de manager (la portée « équipe » ne doit pas passer par un compte supprimé) ;
 * - son adresse email est libérée (on pourra réinviter la personne).
 * `utilisateur` est en RLS permissive : le filtre sur l'entreprise est explicite. Les sessions et identifiants de connexion (tables de Better-Auth)
 * sont effacés par l'appelant, APRÈS la transaction.
 */
export async function retirerCompteEnBase(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, email: string): Promise<void> {
  const enAttente = await tx
    .select({ id: invitation.id })
    .from(invitation)
    .where(and(eq(invitation.entrepriseId, entrepriseId), eq(invitation.email, email), isNull(invitation.utiliseeLe)));
  await annulerInvitationsNonUtilisees(tx, entrepriseId, enAttente.map((i) => i.id));

  await tx.update(utilisateur).set({ managerId: null }).where(and(eq(utilisateur.managerId, utilisateurId), eq(utilisateur.entrepriseId, entrepriseId)));
  await tx
    .update(utilisateur)
    .set({ statut: "SUPPRIME", email: `supprime-${utilisateurId}@compte-supprime.invalid`, managerId: null })
    .where(and(eq(utilisateur.id, utilisateurId), eq(utilisateur.entrepriseId, entrepriseId)));
}

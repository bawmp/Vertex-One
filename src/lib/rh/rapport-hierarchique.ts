import { and, eq, ne } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { utilisateur } from "@/db/schema";
import { destinatairesAutorises, type PersonneRapport } from "@/lib/rh/rapport-hierarchique-regles";

/**
 * Personnes à qui l'utilisateur connecté peut écrire un rapport. `utilisateur` est en RLS permissive (Better-Auth) : le filtre sur
 * l'entreprise est donc explicite, jamais déduit. Lu en base à chaque envoi — le destinataire envoyé par le navigateur n'est jamais cru.
 */
export async function destinatairesPossibles(tx: TransactionDrizzle, moi: { utilisateurId: string; entrepriseId: string; role: string }): Promise<PersonneRapport[]> {
  const personnes = await tx
    .select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet, role: utilisateur.role, statut: utilisateur.statut, managerId: utilisateur.managerId })
    .from(utilisateur)
    .where(and(eq(utilisateur.entrepriseId, moi.entrepriseId), ne(utilisateur.statut, "SUPPRIME")));
  return destinatairesAutorises({ id: moi.utilisateurId, role: moi.role }, personnes);
}

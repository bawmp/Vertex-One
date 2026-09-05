import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { utilisateur as tableUtilisateur } from "@/db/schema";
import { portee, type Module } from "@/lib/permissions";
import type { UtilisateurConnecte } from "@/lib/session";

/**
 * Traduit portee(role, module) en filtre concret sur assigneAId — voir
 * docs/palier-0-*, section 5. "TOUT" signifie "ne pas filtrer" ; sinon la
 * liste d'ids à utiliser dans un .where(inArray(colonne.assigneAId, ids)).
 */
export async function idsVisibles(
  tx: TransactionDrizzle,
  utilisateurConnecte: UtilisateurConnecte,
  module: Module
): Promise<"TOUT" | string[]> {
  const scope = portee(utilisateurConnecte.role, module);

  if (scope === "TOUT") return "TOUT";
  if (scope === "PROPRE") return [utilisateurConnecte.utilisateurId];

  // EQUIPE : l'utilisateur lui-même + les collaborateurs qui lui sont rattachés.
  const membres = await tx
    .select({ id: tableUtilisateur.id })
    .from(tableUtilisateur)
    .where(eq(tableUtilisateur.managerId, utilisateurConnecte.utilisateurId));

  return [utilisateurConnecte.utilisateurId, ...membres.map((m) => m.id)];
}

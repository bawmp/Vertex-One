import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { RoleSysteme } from "@/lib/permissions";

export type UtilisateurConnecte = {
  utilisateurId: string;
  entrepriseId: string;
  role: RoleSysteme;
};

/**
 * À utiliser dans les Server Components, Server Actions et Route Handlers.
 * Ne jamais faire confiance à un entrepriseId/role envoyé par le client —
 * uniquement à ce que retourne cette fonction, dérivée de la session signée
 * par Better-Auth. Voir docs/palier-0-*, section 7.
 */
export async function recupererUtilisateurConnecte(): Promise<UtilisateurConnecte | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const user = session.user as typeof session.user & {
    entrepriseId: string;
    role: RoleSysteme;
  };

  return {
    utilisateurId: user.id,
    entrepriseId: user.entrepriseId,
    role: user.role,
  };
}

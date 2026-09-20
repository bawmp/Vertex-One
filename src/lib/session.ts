import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { Module, RoleSysteme } from "@/lib/permissions";

export type Langue = "fr" | "en";
export type Theme = "clair" | "sombre" | "systeme";

export type UtilisateurConnecte = {
  utilisateurId: string;
  entrepriseId: string;
  role: RoleSysteme;
  // Optionnels sur le type (pas sur ce que renvoie réellement cette
  // fonction, qui les peuple toujours) pour ne pas casser les dizaines de
  // littéraux UtilisateurConnecte construits à la main dans les tests
  // (permissions/portée), qui ne s'en servent jamais — tout code qui les lit
  // réellement doit donc prévoir un repli (langue ?? "fr", etc.), jamais
  // supposer leur présence.
  langue?: Langue;
  theme?: Theme;
  ordreModules?: string[] | null;
  // Restriction posée par l'Administrateur (null = tous les modules du rôle) — lue par peut()/portee().
  modulesAutorises?: Module[] | null;
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
    statut: string;
    langue: Langue;
    theme: Theme;
    ordreModules: string[] | null;
    modulesAutorises: Module[] | null;
  };

  // utilisateur.statut est déjà exposé sur la session (additionalFields,
  // src/lib/auth.ts) mais n'était jusqu'ici vérifié nulle part — un compte
  // DESACTIVE (offboarding, échange du 2026-09-08) gardait donc un accès
  // complet tant que son cookie de session restait valide. Traité comme
  // "non connecté" plutôt qu'une erreur : chaque appelant fait déjà
  // `if (!utilisateurConnecte) redirect("/connexion")`.
  if (user.statut !== "ACTIF") return null;

  return {
    utilisateurId: user.id,
    entrepriseId: user.entrepriseId,
    role: user.role,
    langue: user.langue ?? "fr",
    theme: user.theme ?? "systeme",
    ordreModules: user.ordreModules ?? null,
    modulesAutorises: user.modulesAutorises ?? null,
  };
}

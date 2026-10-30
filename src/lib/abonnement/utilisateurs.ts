import { and, eq, ne, sql } from "drizzle-orm";
import type { db } from "@/db/client";
import { utilisateur } from "@/db/schema";

/**
 * Nombre d'utilisateurs ACTIFS d'une entreprise pour le palier équipe (voir src/lib/abonnement/tarif.ts) : les membres de l'équipe qui
 * se servent réellement de l'application. Ne comptent pas : les invitations en attente, les comptes désactivés ou supprimés, ni les
 * clients du portail (rôle CLIENT, qui ne sont pas des utilisateurs de l'entreprise).
 *
 * La table `utilisateur` est en RLS permissive (Better-Auth la lit avant toute session) : le filtre sur `entrepriseId` est donc
 * explicite ici, jamais laissé à la RLS.
 */
export async function compterUtilisateursActifs(executeur: Pick<typeof db, "select">, entrepriseId: string): Promise<number> {
  const [ligne] = await executeur
    .select({ n: sql<number>`count(*)::int` })
    .from(utilisateur)
    .where(and(eq(utilisateur.entrepriseId, entrepriseId), eq(utilisateur.statut, "ACTIF"), ne(utilisateur.role, "CLIENT")));
  return ligne?.n ?? 0;
}

import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { estEmailStaff } from "./acces-logique";

/**
 * Aucun nouveau système d'authentification — un compte tenant normal déjà
 * connecté (voir recupererUtilisateurConnecte()) est reconnu comme staff
 * Vertex One uniquement si son email figure dans PLATEFORME_ADMINS (liste
 * blanche, variable d'environnement). db.select() direct (pas
 * avecEntreprise()) — "utilisateur" a une RLS permissive pour Better-Auth,
 * même patron déjà utilisé dans src/lib/actions/abonnement.ts pour relire un
 * email depuis la session.
 */
export async function estStaffPlateforme(): Promise<boolean> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return false;
  const [ligne] = await db.select({ email: utilisateur.email }).from(utilisateur).where(eq(utilisateur.id, utilisateurConnecte.utilisateurId));
  return estEmailStaff(ligne?.email ?? null, process.env.PLATEFORME_ADMINS);
}

export async function emailStaffCourant(): Promise<string> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return "inconnu";
  const [ligne] = await db.select({ email: utilisateur.email }).from(utilisateur).where(eq(utilisateur.id, utilisateurConnecte.utilisateurId));
  return ligne?.email ?? "inconnu";
}

import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { membrePlateforme, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { and, isNull } from "drizzle-orm";
import { niveauPlateforme, type NiveauPlateforme } from "./acces-logique";

/**
 * Aucun nouveau système d'authentification — un compte tenant normal déjà
 * connecté (voir recupererUtilisateurConnecte()) est reconnu comme staff
 * Vertex One uniquement si son email figure dans PLATEFORME_ADMINS (liste
 * blanche, variable d'environnement). db.select() direct (pas
 * avecEntreprise()) — "utilisateur" a une RLS permissive pour Better-Auth,
 * même patron déjà utilisé dans src/lib/actions/abonnement.ts pour relire un
 * email depuis la session.
 */
export async function niveauPlateformeCourant(): Promise<NiveauPlateforme | null> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return null;
  const [ligne] = await db.select({ email: utilisateur.email }).from(utilisateur).where(eq(utilisateur.id, utilisateurConnecte.utilisateurId));
  if (!ligne?.email) return null;
  // Le propriétaire (liste blanche) n'a pas besoin de la table ; un collaborateur doit y figurer, non révoqué.
  const proprietaire = niveauPlateforme(ligne.email, process.env.PLATEFORME_ADMINS, []);
  if (proprietaire) return proprietaire;
  const membres = await db.select({ email: membrePlateforme.email }).from(membrePlateforme).where(and(eq(membrePlateforme.email, ligne.email.trim().toLowerCase()), isNull(membrePlateforme.revoqueLe)));
  return niveauPlateforme(ligne.email, process.env.PLATEFORME_ADMINS, membres.map((m) => m.email));
}

/** Propriétaire ou collaborateur de l'équipe plateforme. */
export async function estStaffPlateforme(): Promise<boolean> {
  return (await niveauPlateformeCourant()) !== null;
}

/** Seul le propriétaire gère l'équipe plateforme (ajouter, retirer) : un collaborateur ne peut ni s'élargir ni retirer le propriétaire. */
export async function estProprietairePlateforme(): Promise<boolean> {
  return (await niveauPlateformeCourant()) === "PROPRIETAIRE";
}

export async function emailStaffCourant(): Promise<string> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return "inconnu";
  const [ligne] = await db.select({ email: utilisateur.email }).from(utilisateur).where(eq(utilisateur.id, utilisateurConnecte.utilisateurId));
  return ligne?.email ?? "inconnu";
}

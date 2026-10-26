import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { membrePlateforme, utilisateur } from "@/db/schema";
import { estEmailStaff } from "./acces-logique";

/**
 * Équipe de la console interne plateforme (2026-10-26) : logique sans session, testable. Les appelants (src/lib/actions/plateforme.ts) vérifient
 * TOUJOURS que l'utilisateur connecté est PROPRIÉTAIRE avant d'appeler ces fonctions, et leur passent son email.
 */
export type MembreEquipe = { id: string; email: string; ajouteParEmail: string; ajouteLe: Date; revoqueLe: Date | null; revoqueParEmail: string | null };

export async function listerMembresEquipe(): Promise<MembreEquipe[]> {
  return db.select().from(membrePlateforme).orderBy(desc(membrePlateforme.ajouteLe));
}

/**
 * Ajoute (ou rétablit) un collaborateur. Il doit DÉJÀ avoir un compte actif : sinon, quelqu'un pourrait créer un compte avec cette adresse avant lui
 * et hériter de l'accès. Un propriétaire (liste blanche) n'a pas à y figurer.
 */
export async function ajouterMembreEquipe(parEmail: string, emailBrut: string, allowlist: string | undefined): Promise<{ erreur?: string }> {
  const email = emailBrut.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { erreur: "Adresse email invalide." };
  if (estEmailStaff(email, allowlist)) return { erreur: "Cette adresse est déjà celle d'un propriétaire de la plateforme." };

  const [compte] = await db.select({ id: utilisateur.id, statut: utilisateur.statut }).from(utilisateur).where(eq(utilisateur.email, email));
  if (!compte || compte.statut !== "ACTIF") return { erreur: "Aucun compte actif avec cette adresse : la personne doit d'abord créer son compte Vertex One (par invitation dans votre entreprise, par exemple)." };

  const [existant] = await db.select().from(membrePlateforme).where(eq(membrePlateforme.email, email));
  if (existant && !existant.revoqueLe) return { erreur: "Cette personne fait déjà partie de l'équipe." };
  if (existant) {
    await db.update(membrePlateforme).set({ revoqueLe: null, revoqueParEmail: null, ajouteParEmail: parEmail.trim().toLowerCase(), ajouteLe: new Date() }).where(eq(membrePlateforme.id, existant.id));
  } else {
    await db.insert(membrePlateforme).values({ email, ajouteParEmail: parEmail.trim().toLowerCase() });
  }
  return {};
}

/** Retire l'accès d'un collaborateur (effet immédiat : le prochain chargement d'une page de la console le refuse). */
export async function revoquerMembreEquipe(parEmail: string, membreId: string): Promise<{ erreur?: string }> {
  const modifies = await db
    .update(membrePlateforme)
    .set({ revoqueLe: new Date(), revoqueParEmail: parEmail.trim().toLowerCase() })
    .where(and(eq(membrePlateforme.id, membreId), isNull(membrePlateforme.revoqueLe), ne(membrePlateforme.email, parEmail.trim().toLowerCase())))
    .returning({ id: membrePlateforme.id });
  return modifies.length === 0 ? { erreur: "Membre introuvable ou déjà retiré." } : {};
}

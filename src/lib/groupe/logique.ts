import { eq, and, isNull, gt } from "drizzle-orm";
import { generateRandomString } from "better-auth/crypto";
import { db, avecEntreprise } from "@/db/client";
import { groupe, invitationGroupe, entreprise } from "@/db/schema";

// Même durée que les invitations employé (src/lib/actions/invitation.ts).
const DUREE_EXPIRATION_MS = 72 * 60 * 60 * 1000;

export type ResultatGroupe = { erreur?: string; succes?: string } | null;

/**
 * Logique pure du groupe d'entreprises (2026-09-15), séparée des Server
 * Actions (src/lib/actions/groupe.ts) pour rester testable directement en
 * Vitest — recupererUtilisateurConnecte() est indisponible hors requête
 * HTTP réelle (même patron que src/lib/abonnement/etat.ts). Prend
 * `entrepriseId` explicitement plutôt que de le dériver d'une session.
 */
export async function creerGroupePour(entrepriseId: string, nom: string): Promise<ResultatGroupe> {
  const [monEntreprise] = await db.select({ groupeId: entreprise.groupeId }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (monEntreprise?.groupeId) {
    return { erreur: "Cette entreprise appartient déjà à un groupe — quittez-le d'abord." };
  }

  const [nouveauGroupe] = await db.insert(groupe).values({ nom }).returning({ id: groupe.id });
  await avecEntreprise(entrepriseId, (tx) => tx.update(entreprise).set({ groupeId: nouveauGroupe.id }).where(eq(entreprise.id, entrepriseId)));
  return null;
}

export async function genererInvitationGroupePour(entrepriseId: string): Promise<ResultatGroupe> {
  const [monEntreprise] = await db.select({ groupeId: entreprise.groupeId }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (!monEntreprise?.groupeId) {
    return { erreur: "Créez d'abord un groupe avant de générer un code de rattachement." };
  }

  const jeton = generateRandomString(24, "a-z", "A-Z", "0-9");
  await db.insert(invitationGroupe).values({ groupeId: monEntreprise.groupeId, jeton, expireLe: new Date(Date.now() + DUREE_EXPIRATION_MS) });
  return { succes: jeton };
}

export async function rattacherFilialeAuGroupePour(entrepriseId: string, jeton: string): Promise<ResultatGroupe> {
  const [monEntreprise] = await db.select({ groupeId: entreprise.groupeId }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (monEntreprise?.groupeId) {
    return { erreur: "Cette entreprise appartient déjà à un groupe — quittez-le d'abord." };
  }

  const [invitationValide] = await db
    .select()
    .from(invitationGroupe)
    .where(and(eq(invitationGroupe.jeton, jeton), isNull(invitationGroupe.utiliseeLe), gt(invitationGroupe.expireLe, new Date())));

  if (!invitationValide) {
    return { erreur: "Ce code de rattachement est invalide, déjà utilisé ou expiré." };
  }

  await avecEntreprise(entrepriseId, (tx) => tx.update(entreprise).set({ groupeId: invitationValide.groupeId }).where(eq(entreprise.id, entrepriseId)));
  await db.update(invitationGroupe).set({ utiliseeLe: new Date() }).where(eq(invitationGroupe.id, invitationValide.id));
  return null;
}

/** Aucune cascade — aucune donnée n'est jamais partagée entre filiales. */
export async function quitterGroupePour(entrepriseId: string): Promise<void> {
  await avecEntreprise(entrepriseId, (tx) => tx.update(entreprise).set({ groupeId: null }).where(eq(entreprise.id, entrepriseId)));
}

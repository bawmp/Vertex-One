"use server";

import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { notePersonnelle } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";

/**
 * Bloc-notes privé de l'Espace personnel Admin (Tranche 4, 2026-09-14) — une
 * seule ligne par utilisateur (contrainte unique sur utilisateurId).
 * L'isolation individuelle (personne d'autre, pas même un autre Admin, ne
 * doit voir cette note) n'est PAS garantie par la RLS seule (qui ne protège
 * que la frontière entre entreprises) : tout accès filtre explicitement sur
 * utilisateurId = soi-même, jamais sur un id reçu du client — même principe
 * que resoudreMonContact()/peutVoirTicketSupport() (Assistance client).
 */
export async function recupererMaNote(): Promise<string> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") redirect("/app");

  const [ligne] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.select({ contenu: notePersonnelle.contenu }).from(notePersonnelle).where(eq(notePersonnelle.utilisateurId, utilisateurConnecte.utilisateurId))
  );
  return ligne?.contenu ?? "";
}

export async function enregistrerMaNote(contenu: string): Promise<void> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") redirect("/app");

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [existante] = await tx
      .select({ id: notePersonnelle.id })
      .from(notePersonnelle)
      .where(eq(notePersonnelle.utilisateurId, utilisateurConnecte.utilisateurId));

    if (existante) {
      await tx
        .update(notePersonnelle)
        .set({ contenu, misAJourLe: new Date() })
        .where(and(eq(notePersonnelle.id, existante.id), eq(notePersonnelle.utilisateurId, utilisateurConnecte.utilisateurId)));
    } else {
      await tx.insert(notePersonnelle).values({ entrepriseId: utilisateurConnecte.entrepriseId, utilisateurId: utilisateurConnecte.utilisateurId, contenu });
    }
  });

  revalidatePath("/app/mon-espace");
}

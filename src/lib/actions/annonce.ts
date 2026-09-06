"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { annonce } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";

const schemaAnnonce = z.object({
  contenu: z.string().trim().min(1, "L'annonce ne peut pas être vide."),
});

export type EtatAnnonce = { erreur?: string } | null;

/**
 * Portée toujours TOUT en lecture (docs/palier-3-*, section 7) — seule la
 * création est réservée par rôle (Manager/Administrateur), déjà vérifié par
 * peut("ANNONCES", "CREER") : un Employé n'a pas cette action dans la
 * matrice (src/lib/permissions.ts).
 */
export async function creerAnnonce(_etat: EtatAnnonce, formData: FormData): Promise<EtatAnnonce> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "ANNONCES", "CREER")) {
    return { erreur: "Seuls les Managers et l'Administrateur peuvent publier une annonce." };
  }

  const analyse = schemaAnnonce.safeParse({ contenu: formData.get("contenu") });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(annonce).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      auteurId: utilisateurConnecte.utilisateurId,
      contenu: analyse.data.contenu,
    })
  );

  revalidatePath("/app/annonces");
  revalidatePath("/app");
  return null;
}

export async function epinglerAnnonce(annonceId: string, epinglee: boolean) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "ANNONCES", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(annonce).set({ epinglee }).where(eq(annonce.id, annonceId))
  );

  revalidatePath("/app/annonces");
}

export async function supprimerAnnonce(annonceId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "ANNONCES", "SUPPRIMER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.delete(annonce).where(eq(annonce.id, annonceId)));

  revalidatePath("/app/annonces");
}

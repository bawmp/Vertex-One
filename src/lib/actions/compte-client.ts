"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { compteClient } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";

const schemaCompteClient = z.object({
  nom: z.string().trim().min(2, "Le nom est trop court."),
  niu: z.string().trim().optional(),
});

export type EtatCompteClient = { erreur?: string } | null;

export async function creerCompteClient(_etat: EtatCompteClient, formData: FormData): Promise<EtatCompteClient> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer un compte." };
  }

  const analyse = schemaCompteClient.safeParse({
    nom: formData.get("nom"),
    niu: formData.get("niu") || undefined,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { nom, niu } = analyse.data;

  const [nouveauCompte] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(compteClient).values({ entrepriseId: utilisateurConnecte.entrepriseId, nom, niu }).returning({ id: compteClient.id })
  );

  revalidatePath("/app/comptes");
  redirect(`/app/comptes/${nouveauCompte.id}`);
}

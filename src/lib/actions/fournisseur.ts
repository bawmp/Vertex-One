"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { fournisseur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";

const schemaFournisseur = z.object({
  nom: z.string().trim().min(2, "Le nom est trop court."),
  niu: z.string().trim().optional(),
  telephone: z.string().trim().min(6, "Numéro de téléphone invalide."),
  email: z.email().optional().or(z.literal("")),
  adresse: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type EtatFournisseur = { erreur?: string } | null;

export async function creerFournisseur(_etat: EtatFournisseur, formData: FormData): Promise<EtatFournisseur> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "ACHATS", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer un fournisseur." };
  }

  const analyse = schemaFournisseur.safeParse({
    nom: formData.get("nom"),
    niu: formData.get("niu") || undefined,
    telephone: formData.get("telephone"),
    email: formData.get("email") || "",
    adresse: formData.get("adresse") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { nom, niu, telephone, email, adresse, notes } = analyse.data;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(fournisseur).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      nom,
      niu,
      telephone,
      email: email || undefined,
      adresse,
      notes,
    })
  );

  revalidatePath("/app/achats");
  redirect("/app/achats");
}

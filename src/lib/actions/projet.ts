"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { projet, commentaire, statutProjet } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { creerCanalPourProjet } from "@/lib/chat/pont";

const schemaProjet = z.object({
  dossierId: z.string(),
  titre: z.string().trim().min(2, "Le titre est trop court."),
  description: z.string().trim().optional(),
  dateEcheance: z.string().optional(),
});

export type EtatProjet = { erreur?: string } | null;

export async function creerProjet(_etat: EtatProjet, formData: FormData): Promise<EtatProjet> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PROJETS", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer un projet." };
  }

  const analyse = schemaProjet.safeParse({
    dossierId: formData.get("dossierId"),
    titre: formData.get("titre"),
    description: formData.get("description") || undefined,
    dateEcheance: formData.get("dateEcheance") || undefined,
  });

  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { dossierId, titre, description, dateEcheance } = analyse.data;

  const nouveauProjet = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [p] = await tx
      .insert(projet)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        dossierId,
        titre,
        description,
        dateEcheance: dateEcheance ? new Date(dateEcheance) : undefined,
        responsablePrincipalId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: projet.id });

    // Palier 3, section 5 — même pont que pour un Projet issu d'un devis
    // accepté : jamais de Projet sans son canal de discussion.
    await creerCanalPourProjet(tx, {
      entrepriseId: utilisateurConnecte.entrepriseId,
      projetId: p.id,
      titre,
      responsablePrincipalId: utilisateurConnecte.utilisateurId,
    });

    return p;
  });

  revalidatePath(`/app/projets/dossiers/${dossierId}`);
  redirect(`/app/projets/${nouveauProjet.id}`);
}

export async function changerStatutProjet(projetId: string, statut: (typeof statutProjet.enumValues)[number]) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PROJETS", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(projet).set({ statut }).where(eq(projet.id, projetId))
  );

  revalidatePath(`/app/projets/${projetId}`);
  revalidatePath("/app/projets");
  revalidatePath("/app");
}

export type EtatCommentaireProjet = { erreur?: string } | null;

export async function ajouterCommentaireProjet(_etat: EtatCommentaireProjet, formData: FormData): Promise<EtatCommentaireProjet> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PROJETS", "MODIFIER")) {
    return { erreur: "Vous n'avez pas le droit de commenter ce projet." };
  }

  const projetId = String(formData.get("projetId") ?? "");
  const contenu = String(formData.get("contenu") ?? "").trim();
  if (!contenu) return { erreur: "Le commentaire ne peut pas être vide." };

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(commentaire).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      projetId,
      auteurId: utilisateurConnecte.utilisateurId,
      contenu,
    })
  );

  revalidatePath(`/app/projets/${projetId}`);
  return null;
}

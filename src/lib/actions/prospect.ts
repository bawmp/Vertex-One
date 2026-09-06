"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { prospect, interaction, statutProspect } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { genererLienVisio } from "@/lib/marketing/visio";

const schemaProspect = z.object({
  nom: z.string().trim().min(2, "Le nom est trop court."),
  societeCliente: z.string().trim().optional(),
  telephone: z.string().trim().min(6, "Numéro de téléphone invalide."),
  email: z.email().optional().or(z.literal("")),
  niu: z.string().trim().optional(),
});

export type EtatProspect = { erreur?: string } | null;

/**
 * Assigné à son créateur par défaut (docs/palier-1-*, section 6, étape 1) —
 * un Manager/Administrateur pourra réassigner plus tard (hors scope v1).
 */
export async function creerProspect(_etat: EtatProspect, formData: FormData): Promise<EtatProspect> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer un prospect." };
  }

  const analyse = schemaProspect.safeParse({
    nom: formData.get("nom"),
    societeCliente: formData.get("societeCliente") || undefined,
    telephone: formData.get("telephone"),
    email: formData.get("email") || "",
    niu: formData.get("niu") || undefined,
  });

  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { nom, societeCliente, telephone, email, niu } = analyse.data;

  const [nouveauProspect] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .insert(prospect)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        nom,
        societeCliente,
        telephone,
        email: email || undefined,
        niu,
        assigneAId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: prospect.id })
  );

  revalidatePath("/app"); // pipeline commercial affiché au tableau de bord

  redirect(`/app/crm/${nouveauProspect.id}`);
}

const schemaInteraction = z.object({
  prospectId: z.string(),
  type: z.enum(["appel", "whatsapp", "email", "rendez-vous", "note"]),
  contenu: z.string().trim().min(1, "Le contenu ne peut pas être vide."),
});

export type EtatInteraction = { erreur?: string } | null;

export async function ajouterInteraction(_etat: EtatInteraction, formData: FormData): Promise<EtatInteraction> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "MODIFIER")) {
    return { erreur: "Vous n'avez pas le droit d'ajouter une interaction." };
  }

  const analyse = schemaInteraction.safeParse({
    prospectId: formData.get("prospectId"),
    type: formData.get("type"),
    contenu: formData.get("contenu"),
  });

  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { prospectId, type, contenu } = analyse.data;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(interaction).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      prospectId,
      type,
      contenu,
      auteurId: utilisateurConnecte.utilisateurId,
    })
  );

  revalidatePath(`/app/crm/${prospectId}`);
  return null;
}

/**
 * Docs/palier-6-*, section 4 — génère un lien Jitsi et l'enregistre
 * directement comme une Interaction de type "rendez-vous", à partager
 * ensuite par WhatsApp/email depuis l'historique du prospect.
 */
export async function genererEtEnregistrerLienVisio(prospectId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "MODIFIER")) return;

  const lien = genererLienVisio(utilisateurConnecte.entrepriseId, prospectId);

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(interaction).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      prospectId,
      type: "rendez-vous",
      contenu: lien,
      auteurId: utilisateurConnecte.utilisateurId,
    })
  );

  revalidatePath(`/app/crm/${prospectId}`);
}

export async function changerStatutProspect(prospectId: string, statut: (typeof statutProspect.enumValues)[number]) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(prospect).set({ statut }).where(eq(prospect.id, prospectId))
  );

  revalidatePath(`/app/crm/${prospectId}`);
  revalidatePath("/app/crm");
  revalidatePath("/app"); // pipeline commercial affiché au tableau de bord
}

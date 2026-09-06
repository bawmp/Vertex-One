"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { contact, interaction } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { genererLienVisio } from "@/lib/marketing/visio";

const schemaContact = z.object({
  nom: z.string().trim().min(2, "Le nom est trop court."),
  compteId: z.string().trim().optional(),
  fonction: z.string().trim().optional(),
  telephone: z.string().trim().min(6, "Numéro de téléphone invalide."),
  email: z.email().optional().or(z.literal("")),
  notes: z.string().trim().optional(),
});

export type EtatContact = { erreur?: string } | null;

/**
 * Création directe d'un Contact, sans passer par un Lead — pour un client
 * déjà connu (docs de référence Zoho CRM : les Contacts peuvent aussi être
 * créés directement, pas uniquement par conversion).
 */
export async function creerContact(_etat: EtatContact, formData: FormData): Promise<EtatContact> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer un contact." };
  }

  const analyse = schemaContact.safeParse({
    nom: formData.get("nom"),
    compteId: formData.get("compteId") || undefined,
    fonction: formData.get("fonction") || undefined,
    telephone: formData.get("telephone"),
    email: formData.get("email") || "",
    notes: formData.get("notes") || undefined,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { nom, compteId, fonction, telephone, email, notes } = analyse.data;

  const [nouveauContact] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .insert(contact)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        nom,
        compteId: compteId || undefined,
        fonction,
        telephone,
        email: email || undefined,
        notes,
        assigneAId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: contact.id })
  );

  revalidatePath("/app/contacts");
  redirect(`/app/contacts/${nouveauContact.id}`);
}

const schemaInteraction = z.object({
  contactId: z.string(),
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
    contactId: formData.get("contactId"),
    type: formData.get("type"),
    contenu: formData.get("contenu"),
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { contactId, type, contenu } = analyse.data;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(interaction).values({ entrepriseId: utilisateurConnecte.entrepriseId, contactId, type, contenu, auteurId: utilisateurConnecte.utilisateurId })
  );

  revalidatePath(`/app/contacts/${contactId}`);
  return null;
}

/**
 * Docs/palier-6-*, section 4 — génère un lien Jitsi et l'enregistre
 * directement comme une Interaction de type "rendez-vous".
 */
export async function genererEtEnregistrerLienVisio(contactId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "MODIFIER")) return;

  const lien = genererLienVisio(utilisateurConnecte.entrepriseId, contactId);

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(interaction).values({ entrepriseId: utilisateurConnecte.entrepriseId, contactId, type: "rendez-vous", contenu: lien, auteurId: utilisateurConnecte.utilisateurId })
  );

  revalidatePath(`/app/contacts/${contactId}`);
}

export async function modifierNotesContact(contactId: string, notes: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(contact).set({ notes: notes || null }).where(eq(contact.id, contactId)));

  revalidatePath(`/app/contacts/${contactId}`);
}

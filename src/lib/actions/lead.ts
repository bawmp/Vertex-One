"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { lead, statutLead } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { convertirLead } from "@/lib/crm/conversion";

const schemaLead = z.object({
  nom: z.string().trim().min(2, "Le nom est trop court."),
  societeCliente: z.string().trim().optional(),
  telephone: z.string().trim().min(6, "Numéro de téléphone invalide."),
  email: z.email().optional().or(z.literal("")),
  notes: z.string().trim().optional(),
});

export type EtatLead = { erreur?: string } | null;

/**
 * Assigné à son créateur par défaut (même principe que l'ancien Prospect
 * unique, docs/palier-1-*, section 6, étape 1).
 */
export async function creerLead(_etat: EtatLead, formData: FormData): Promise<EtatLead> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer un lead." };
  }

  const analyse = schemaLead.safeParse({
    nom: formData.get("nom"),
    societeCliente: formData.get("societeCliente") || undefined,
    telephone: formData.get("telephone"),
    email: formData.get("email") || "",
    notes: formData.get("notes") || undefined,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { nom, societeCliente, telephone, email, notes } = analyse.data;

  const [nouveauLead] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .insert(lead)
      .values({ entrepriseId: utilisateurConnecte.entrepriseId, nom, societeCliente, telephone, email: email || undefined, notes, assigneAId: utilisateurConnecte.utilisateurId })
      .returning({ id: lead.id })
  );

  revalidatePath("/app/leads");
  redirect(`/app/leads/${nouveauLead.id}`);
}

export async function changerStatutLead(leadId: string, statut: (typeof statutLead.enumValues)[number]) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(lead).set({ statut }).where(eq(lead.id, leadId)));

  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath("/app/leads");
}

export async function modifierNotesLead(leadId: string, notes: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(lead).set({ notes: notes || null }).where(eq(lead.id, leadId)));

  revalidatePath(`/app/leads/${leadId}`);
}

/**
 * Docs de référence Zoho CRM (échange du 2026-09-06) : "Once the lead is
 * qualified, you can convert the lead into a Contact, Account, and Deal."
 * Redirige directement vers le Deal créé, pas vers le Lead (qui devient
 * archivé/converti).
 */
export async function convertirLeadAction(leadId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "MODIFIER")) return;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    convertirLead(tx, { entrepriseId: utilisateurConnecte.entrepriseId, leadId, modifieParId: utilisateurConnecte.utilisateurId })
  );

  revalidatePath("/app/leads");
  if (!resultat) return;

  redirect(`/app/deals/${resultat.dealId}`);
}

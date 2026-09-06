"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { deal, contact, statutDeal } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { enregistrerCreationDeal, changerStatutDealEtHistoriser } from "@/lib/crm/historique";

const schemaDeal = z.object({
  titre: z.string().trim().min(2, "Le titre est requis."),
  montant: z.coerce.number().int().min(0).default(0),
  contactId: z.string().trim().min(1, "Sélectionnez un contact."),
  dateClotureEstimee: z.string().optional(),
});

export type EtatDeal = { erreur?: string } | null;

export async function creerDeal(_etat: EtatDeal, formData: FormData): Promise<EtatDeal> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer un deal." };
  }

  const analyse = schemaDeal.safeParse({
    titre: formData.get("titre"),
    montant: formData.get("montant") || 0,
    contactId: formData.get("contactId"),
    dateClotureEstimee: formData.get("dateClotureEstimee") || undefined,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { titre, montant, contactId, dateClotureEstimee } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leContact] = await tx.select({ compteId: contact.compteId }).from(contact).where(eq(contact.id, contactId));
    if (!leContact) return { erreur: "Contact introuvable." };

    const [nouveauDeal] = await tx
      .insert(deal)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        titre,
        montant,
        contactId,
        compteId: leContact.compteId,
        dateClotureEstimee: dateClotureEstimee ? new Date(dateClotureEstimee) : undefined,
        assigneAId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: deal.id, statut: deal.statut });

    await enregistrerCreationDeal(tx, {
      entrepriseId: utilisateurConnecte.entrepriseId,
      dealId: nouveauDeal.id,
      statut: nouveauDeal.statut,
      modifieParId: utilisateurConnecte.utilisateurId,
    });

    return { id: nouveauDeal.id };
  });

  if ("erreur" in resultat) return resultat;

  revalidatePath("/app/deals");
  redirect(`/app/deals/${resultat.id}`);
}

/**
 * Chaque changement de statut réel (jamais un statut identique) alimente
 * historiqueStatutDeal — la timeline du pipeline, inspirée du timeline de
 * Deal dans Zoho CRM (échange du 2026-09-06).
 */
export async function changerStatutDeal(dealId: string, statut: (typeof statutDeal.enumValues)[number]) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    changerStatutDealEtHistoriser(tx, { entrepriseId: utilisateurConnecte.entrepriseId, dealId, nouveauStatut: statut, modifieParId: utilisateurConnecte.utilisateurId })
  );

  revalidatePath(`/app/deals/${dealId}`);
  revalidatePath("/app/deals");
  revalidatePath("/app"); // pipeline commercial affiché au tableau de bord
}

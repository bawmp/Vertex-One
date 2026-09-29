"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { deal, contact, statutDeal, dealContact } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { enregistrerCreationDeal, changerStatutDealEtHistoriser } from "@/lib/crm/historique";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

const schemaDeal = z.object({
  titre: z.string().trim().min(2, m("Le titre est requis.")),
  montant: z.coerce.number().int().min(0).default(0),
  contactId: z.string().trim().min(1, m("Sélectionnez un contact.")),
  dateClotureEstimee: z.string().optional(),
});

export type EtatDeal = { erreur?: string } | null;

export async function creerDeal(_etat: EtatDeal, formData: FormData): Promise<EtatDeal> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "CREER")) {
    return { erreur: t("Vous n'avez pas le droit de créer un deal.") };
  }

  const analyse = schemaDeal.safeParse({
    titre: formData.get("titre"),
    montant: formData.get("montant") || 0,
    contactId: formData.get("contactId"),
    dateClotureEstimee: formData.get("dateClotureEstimee") || undefined,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? t("Formulaire invalide.") };
  }
  const { titre, montant, contactId, dateClotureEstimee } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leContact] = await tx.select({ compteId: contact.compteId }).from(contact).where(eq(contact.id, contactId));
    if (!leContact) return { erreur: t("Contact introuvable.") };

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
  if (!peut(utilisateurConnecte, "CRM", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    changerStatutDealEtHistoriser(tx, { entrepriseId: utilisateurConnecte.entrepriseId, dealId, nouveauStatut: statut, modifieParId: utilisateurConnecte.utilisateurId })
  );

  revalidatePath(`/app/deals/${dealId}`);
  revalidatePath("/app/deals");
  revalidatePath("/app"); // pipeline commercial affiché au tableau de bord
}

/**
 * Contact supplémentaire d'un Deal (2026-09-29) — deal.contactId reste le contact principal, inchangé ; cette
 * action n'ajoute qu'une liaison secondaire (ex. un couple sur un même dossier d'immigration). Le contact
 * principal ne peut pas être ajouté une seconde fois comme secondaire (message clair plutôt qu'une erreur de
 * contrainte SQL brute) ; un doublon d'ajout est de toute façon bloqué par l'index unique (deal_contact_deal_contact_unique).
 */
export async function ajouterContactSupplementaireDeal(dealId: string, _etat: EtatDeal, formData: FormData): Promise<EtatDeal> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "MODIFIER")) {
    return { erreur: t("Vous n'avez pas le droit de modifier ce deal.") };
  }

  const contactId = (formData.get("contactId") as string) || "";
  if (!contactId) return { erreur: t("Sélectionnez un contact.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leDeal] = await tx.select({ contactId: deal.contactId }).from(deal).where(eq(deal.id, dealId));
    if (!leDeal) return { erreur: t("Deal introuvable.") };
    if (leDeal.contactId === contactId) return { erreur: t("Ce contact est déjà le contact principal de ce deal.") };

    const [leContact] = await tx.select({ id: contact.id }).from(contact).where(eq(contact.id, contactId));
    if (!leContact) return { erreur: t("Contact introuvable.") };

    await tx.insert(dealContact).values({ entrepriseId: utilisateurConnecte.entrepriseId, dealId, contactId }).onConflictDoNothing();
    return null;
  });
  if (resultat?.erreur) return resultat;

  revalidatePath(`/app/deals/${dealId}`);
  revalidatePath(`/app/contacts/${contactId}`);
  return null;
}

export async function retirerContactSupplementaireDeal(dealId: string, contactId: string): Promise<void> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.delete(dealContact).where(and(eq(dealContact.dealId, dealId), eq(dealContact.contactId, contactId)))
  );

  revalidatePath(`/app/deals/${dealId}`);
  revalidatePath(`/app/contacts/${contactId}`);
}

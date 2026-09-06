"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise, type TransactionDrizzle } from "@/db/client";
import { tacheCrm, reunionCrm, statutTacheCrm, deal } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";

// Activités de l'Accueil CRM (inspirées de Zoho CRM, échange du 2026-09-06)
// — Objet/Titre + une seule relation optionnelle parmi Lead/Contact/Deal
// ("Relatif à"), résolue ici en un seul champ pour rester simple côté
// formulaire plutôt que de dupliquer trois selects.
const schemaRelation = z.object({
  relatifAType: z.enum(["aucun", "lead", "contact", "deal"]),
  relatifAId: z.string().trim().optional(),
});

// Quand la relation choisie est un Deal, le Contact du Deal est repris
// automatiquement (deal.contactId n'est jamais nul) — comme chez Zoho, où le
// champ "Nom du contact" d'une tâche liée à un Deal se remplit avec le
// contact du Deal plutôt que de rester vide.
async function resoudreRelation(tx: TransactionDrizzle, donnees: z.infer<typeof schemaRelation>) {
  if (donnees.relatifAType === "aucun" || !donnees.relatifAId) {
    return { leadId: undefined, contactId: undefined, dealId: undefined };
  }
  if (donnees.relatifAType === "deal") {
    const [leDeal] = await tx.select({ contactId: deal.contactId }).from(deal).where(eq(deal.id, donnees.relatifAId));
    return { leadId: undefined, contactId: leDeal?.contactId, dealId: donnees.relatifAId };
  }
  return {
    leadId: donnees.relatifAType === "lead" ? donnees.relatifAId : undefined,
    contactId: donnees.relatifAType === "contact" ? donnees.relatifAId : undefined,
    dealId: undefined,
  };
}

const schemaTacheCrm = schemaRelation.extend({
  objet: z.string().trim().min(2, "L'objet est trop court."),
  dateEcheance: z.string().trim().optional(),
  priorite: z.enum(["BASSE", "NORMALE", "HAUTE"]),
});

export type EtatTacheCrm = { erreur?: string } | null;

export async function creerTacheCrm(_etat: EtatTacheCrm, formData: FormData): Promise<EtatTacheCrm> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer une tâche." };
  }

  const analyse = schemaTacheCrm.safeParse({
    objet: formData.get("objet"),
    dateEcheance: formData.get("dateEcheance") || undefined,
    priorite: formData.get("priorite") || "NORMALE",
    relatifAType: formData.get("relatifAType") || "aucun",
    relatifAId: formData.get("relatifAId") || undefined,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { objet, dateEcheance, priorite } = analyse.data;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const { leadId, contactId, dealId } = await resoudreRelation(tx, analyse.data);
    await tx.insert(tacheCrm).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      objet,
      priorite,
      dateEcheance: dateEcheance ? new Date(dateEcheance) : undefined,
      leadId,
      contactId,
      dealId,
      assigneAId: utilisateurConnecte.utilisateurId,
      creeParId: utilisateurConnecte.utilisateurId,
    });
  });

  revalidatePath("/app/crm");
  return null;
}

export async function changerStatutTacheCrm(tacheId: string, statut: (typeof statutTacheCrm.enumValues)[number]) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .update(tacheCrm)
      .set({ statut, termineeLe: statut === "TERMINEE" ? new Date() : null })
      .where(eq(tacheCrm.id, tacheId))
  );

  revalidatePath("/app/crm");
}

const schemaReunionCrm = schemaRelation.extend({
  titre: z.string().trim().min(2, "Le titre est trop court."),
  dateDebut: z.string().trim().min(1, "La date de début est obligatoire."),
  dateFin: z.string().trim().min(1, "La date de fin est obligatoire."),
});

export type EtatReunionCrm = { erreur?: string } | null;

export async function creerReunionCrm(_etat: EtatReunionCrm, formData: FormData): Promise<EtatReunionCrm> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer une réunion." };
  }

  const analyse = schemaReunionCrm.safeParse({
    titre: formData.get("titre"),
    dateDebut: formData.get("dateDebut"),
    dateFin: formData.get("dateFin"),
    relatifAType: formData.get("relatifAType") || "aucun",
    relatifAId: formData.get("relatifAId") || undefined,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { titre, dateDebut, dateFin } = analyse.data;

  if (new Date(dateFin) < new Date(dateDebut)) {
    return { erreur: "La date de fin doit être après la date de début." };
  }

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const { leadId, contactId, dealId } = await resoudreRelation(tx, analyse.data);
    await tx.insert(reunionCrm).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      titre,
      dateDebut: new Date(dateDebut),
      dateFin: new Date(dateFin),
      leadId,
      contactId,
      dealId,
      assigneAId: utilisateurConnecte.utilisateurId,
      creeParId: utilisateurConnecte.utilisateurId,
    });
  });

  revalidatePath("/app/crm");
  return null;
}

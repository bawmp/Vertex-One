"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { budget, budgetLigne } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";

const schemaLigne = z.object({
  compteId: z.string().min(1, "Chaque ligne doit avoir un compte."),
  montant: z.coerce.number().int().positive("Le montant budgété doit être positif."),
});

const schemaBudget = z.object({
  nom: z.string().trim().min(1, "Le nom est requis."),
  dateDebut: z.string().min(1, "La date de début est requise."),
  dateFin: z.string().min(1, "La date de fin est requise."),
  lignes: z.array(schemaLigne).min(1, "Un budget doit avoir au moins une ligne."),
});

export type EtatBudget = { erreur?: string } | null;

/**
 * Budgets (Zoho Books > Comptable, échange du 2026-09-07) — un montant
 * budgété par compte sur une période ; le réalisé se calcule à la volée
 * (voir src/app/app/comptabilite/budgets/[id]/page.tsx, calculerBalance()),
 * jamais stocké ici. Un compte ne peut apparaître qu'une fois par budget
 * (contrainte unique en base, budgetLigne.budgetId+compteId).
 */
export async function creerBudget(_etat: EtatBudget, formData: FormData): Promise<EtatBudget> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "COMPTABILITE", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer un budget." };
  }

  const comptesId = formData.getAll("compteId").map(String);
  const montants = formData.getAll("montant").map(String);
  const lignesBrutes = comptesId.map((compteId, i) => ({ compteId, montant: montants[i] ?? "0" }));

  const analyse = schemaBudget.safeParse({
    nom: formData.get("nom"),
    dateDebut: formData.get("dateDebut"),
    dateFin: formData.get("dateFin"),
    lignes: lignesBrutes,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { nom, dateDebut, dateFin, lignes } = analyse.data;

  if (new Date(dateFin) <= new Date(dateDebut)) {
    return { erreur: "La date de fin doit être après la date de début." };
  }
  if (new Set(lignes.map((l) => l.compteId)).size !== lignes.length) {
    return { erreur: "Un même compte ne peut apparaître qu'une seule fois dans le budget." };
  }

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leBudget] = await tx
      .insert(budget)
      .values({ entrepriseId: utilisateurConnecte.entrepriseId, nom, dateDebut: new Date(dateDebut), dateFin: new Date(dateFin), creeParId: utilisateurConnecte.utilisateurId })
      .returning({ id: budget.id });

    await tx.insert(budgetLigne).values(
      lignes.map((l) => ({ entrepriseId: utilisateurConnecte.entrepriseId, budgetId: leBudget.id, compteId: l.compteId, montant: l.montant }))
    );
  });

  revalidatePath("/app/comptabilite/budgets");
  return null;
}

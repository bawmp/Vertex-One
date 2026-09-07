"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";

export type EtatVerrouillage = { erreur?: string } | null;

/**
 * Verrouillage de transactions (échange du 2026-09-07) — un champ date vide
 * lève le verrouillage (aucune contrainte). Réservé à l'Administrateur,
 * comme le reste du module Comptabilité. La garde réelle vit dans
 * creerEcritures() (src/lib/comptabilite/ecritures.ts) et creerJournalManuel()
 * — cette action ne fait que positionner la date, jamais de contrôle ici.
 */
export async function definirDateVerrouillage(_etat: EtatVerrouillage, formData: FormData): Promise<EtatVerrouillage> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "COMPTABILITE", "MODIFIER")) {
    return { erreur: "Vous n'avez pas le droit de modifier le verrouillage de transactions." };
  }

  const valeur = formData.get("dateVerrouillage");
  const date = typeof valeur === "string" && valeur.trim() !== "" ? new Date(valeur) : null;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(entreprise).set({ dateVerrouillageComptable: date }).where(eq(entreprise.id, utilisateurConnecte.entrepriseId))
  );

  revalidatePath("/app/comptabilite");
  return null;
}

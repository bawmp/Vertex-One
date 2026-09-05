"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { marquerFacturesEnRetard, type ResultatRelance } from "@/lib/facturation/relance";

export type EtatRelances = { resultats: ResultatRelance[] } | { erreur: string } | null;

/**
 * Déclenchement manuel en attendant la tâche planifiée (graphile-worker,
 * pas encore installée — voir src/lib/facturation/relance.ts). Réservé à
 * l'Administrateur : ce n'est pas une action métier courante, plutôt un
 * geste d'exploitation.
 */
export async function declencherRelances(): Promise<EtatRelances> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PARAMETRES", "MODIFIER")) {
    return { erreur: "Réservé à l'Administrateur." };
  }

  const resultats = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    marquerFacturesEnRetard(tx, utilisateurConnecte.entrepriseId)
  );

  revalidatePath("/app/facturation");
  return { resultats };
}

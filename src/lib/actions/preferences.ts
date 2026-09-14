"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";

/**
 * Ordre personnel des modules de la sidebar (Tranche 3, 2026-09-13) — un
 * utilisateur ne modifie que sa propre ligne, aucune vérification de
 * permission au-delà d'être connecté : c'est son propre confort, jamais une
 * décision qui affecte un collègue (contrairement au logo/couleur
 * d'entreprise, réservés à l'Admin).
 */
export async function definirOrdreModules(ordre: string[]): Promise<void> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(utilisateur).set({ ordreModules: ordre }).where(eq(utilisateur.id, utilisateurConnecte.utilisateurId))
  );

  revalidatePath("/app", "layout");
}

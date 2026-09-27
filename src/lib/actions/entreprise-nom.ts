"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

const CHEMIN = "/app/parametres/entreprise";

export type EtatNomEntreprise = { erreur?: string; succes?: string } | null;

/**
 * Renommer son entreprise n'existait pas encore (seules les informations légales et le groupe étaient modifiables
 * depuis /parametres/entreprise) — un vrai manque, corrigé ici plutôt que réservé à la démo commerciale. Même
 * garde et même filtre sur l'entreprise de l'utilisateur CONNECTÉ que enregistrerInfosLegales (jamais un id transmis
 * par le client).
 */
export async function renommerEntreprise(_etat: EtatNomEntreprise, formData: FormData): Promise<EtatNomEntreprise> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return { erreur: t("Seul un Administrateur peut renommer l'entreprise.") };
  }

  const analyse = z.object({ nom: z.string().trim().min(2, m("Le nom de l'entreprise est trop court.")) }).safeParse({ nom: formData.get("nom") });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? t("Formulaire invalide.") };
  }

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(entreprise).set({ nom: analyse.data.nom }).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)));

  revalidatePath(CHEMIN);
  return { succes: t("Nom de l'entreprise mis à jour.") };
}

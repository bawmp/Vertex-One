"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { modeleEmail, typeModeleEmail } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

const schemaModele = z.object({
  type: z.enum(typeModeleEmail.enumValues),
  objet: z.string().trim().min(1, m("L'objet ne peut pas être vide.")),
  corps: z.string().trim().min(1, m("Le message ne peut pas être vide.")),
});

export type EtatModeleEmail = { erreur?: string; enregistre?: boolean } | null;

/**
 * Upsert sur la contrainte unique (entrepriseId, type) — voir
 * src/db/schema.ts, modele_email_entreprise_type_unique. Réservé à
 * l'Administrateur (PARAMETRES/MODIFIER), même garde que les infos légales.
 */
export async function enregistrerModeleEmail(_etat: EtatModeleEmail, formData: FormData): Promise<EtatModeleEmail> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return { erreur: t("Session expirée.") };
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return { erreur: t("Vous n'avez pas le droit de modifier les modèles d'email.") };
  }

  const analyse = schemaModele.safeParse({
    type: formData.get("type"),
    objet: formData.get("objet"),
    corps: formData.get("corps"),
  });

  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? t("Formulaire invalide.") };
  }

  const { type, objet, corps } = analyse.data;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .insert(modeleEmail)
      .values({ entrepriseId: utilisateurConnecte.entrepriseId, type, objet, corps })
      .onConflictDoUpdate({
        target: [modeleEmail.entrepriseId, modeleEmail.type],
        set: { objet, corps },
      })
  );

  revalidatePath("/app/parametres/modeles-email");
  return { enregistre: true };
}

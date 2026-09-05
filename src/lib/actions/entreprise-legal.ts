"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";

const schemaInfosLegales = z.object({
  niu: z.string().trim().min(1, "Le NIU est obligatoire pour émettre un devis conforme."),
  rccm: z.string().trim().optional(),
  adresse: z.string().trim().optional(),
  ville: z.string().trim().optional(),
  assujettiTVA: z.enum(["oui", "non"]),
});

export type EtatInfosLegales = { erreur?: string } | null;

/**
 * Le NIU est "la mention la plus surveillée par la DGI" — voir docs/
 * palier-1-*, section 2. Réservé à l'Administrateur (PARAMETRES/MODIFIER).
 */
export async function enregistrerInfosLegales(
  _etat: EtatInfosLegales,
  formData: FormData
): Promise<EtatInfosLegales> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PARAMETRES", "MODIFIER")) {
    return { erreur: "Vous n'avez pas le droit de modifier les informations de l'entreprise." };
  }

  const analyse = schemaInfosLegales.safeParse({
    niu: formData.get("niu"),
    rccm: formData.get("rccm") || undefined,
    adresse: formData.get("adresse") || undefined,
    ville: formData.get("ville") || undefined,
    assujettiTVA: formData.get("assujettiTVA") ?? "oui",
  });

  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { niu, rccm, adresse, ville, assujettiTVA } = analyse.data;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .update(entreprise)
      .set({ niu, rccm, adresse, ville, assujettiTVA: assujettiTVA === "oui" })
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId))
  );

  redirect("/app/crm");
}

"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { dossierRH, revisionSalaire } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";

const schemaRevision = z.object({
  dossierRHId: z.string().min(1),
  nouveauSalaire: z.coerce.number().int().positive("Le salaire doit être positif."),
  motif: z.string().trim().optional(),
});

export type EtatRevisionSalaire = { erreur?: string } | null;

/**
 * Historique des révisions de salaire (échange du 2026-09-08, comparaison
 * avec Zoho People — "Salary Revision History") : seul chemin autorisé à
 * modifier dossierRH.salaireBase, réservé à l'Administrateur (règle métier
 * non négociable, CLAUDE.md — le salaire n'est jamais rempli
 * automatiquement). Chaque révision capture l'ancien salaire AVANT
 * d'écraser la valeur, jamais un simple UPDATE silencieux.
 */
export async function reviserSalaire(_etat: EtatRevisionSalaire, formData: FormData): Promise<EtatRevisionSalaire> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut réviser un salaire." };
  }

  const analyse = schemaRevision.safeParse({
    dossierRHId: formData.get("dossierRHId"),
    nouveauSalaire: formData.get("nouveauSalaire"),
    motif: formData.get("motif") || undefined,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { dossierRHId, nouveauSalaire, motif } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leDossier] = await tx.select({ salaireBase: dossierRH.salaireBase }).from(dossierRH).where(eq(dossierRH.id, dossierRHId));
    if (!leDossier) return { erreur: "Dossier RH introuvable." };

    await tx.insert(revisionSalaire).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      dossierRHId,
      ancienSalaire: leDossier.salaireBase,
      nouveauSalaire,
      motif,
      effectueParId: utilisateurConnecte.utilisateurId,
    });

    await tx.update(dossierRH).set({ salaireBase: nouveauSalaire }).where(eq(dossierRH.id, dossierRHId));

    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(`/app/rh/${dossierRHId}`);
  return null;
}

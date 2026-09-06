"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise, contrat } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";

const schemaCreationContrat = z.object({
  dossierId: z.string(),
  titre: z.string().trim().min(2, "Le titre est requis."),
  dateDebut: z.string().min(1, "La date de début est requise."),
  dateFin: z.string().optional(),
  renouvellementAuto: z.string().optional(),
  preavisJours: z.coerce.number().int().min(0).default(30),
});

export type EtatContrat = { erreur?: string } | null;

export async function creerContrat(_etat: EtatContrat, formData: FormData): Promise<EtatContrat> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CONTRATS", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer de contrat." };
  }

  const analyse = schemaCreationContrat.safeParse({
    dossierId: formData.get("dossierId"),
    titre: formData.get("titre"),
    dateDebut: formData.get("dateDebut"),
    dateFin: formData.get("dateFin") || undefined,
    renouvellementAuto: formData.get("renouvellementAuto") || undefined,
    preavisJours: formData.get("preavisJours") || 30,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { dossierId, titre, dateDebut, dateFin, renouvellementAuto, preavisJours } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "CONTRATS")) {
      return { erreur: "Le suivi des contrats est disponible à partir du forfait Business." };
    }

    await tx.insert(contrat).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      dossierId,
      titre,
      dateDebut: new Date(dateDebut),
      dateFin: dateFin ? new Date(dateFin) : undefined,
      renouvellementAuto: renouvellementAuto === "on",
      preavisJours,
    });

    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(`/app/projets/dossiers/${dossierId}`);
  return null;
}

/**
 * Pas de suppression (même esprit que Facture/Dossier, CLAUDE.md) : un
 * contrat résilié garde son historique, seul son statut change.
 */
export async function resilierContrat(contratId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CONTRATS", "MODIFIER")) return;

  const [leContrat] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(contrat).set({ statut: "RESILIE" }).where(eq(contrat.id, contratId)).returning({ dossierId: contrat.dossierId })
  );

  if (leContrat) revalidatePath(`/app/projets/dossiers/${leContrat.dossierId}`);
}

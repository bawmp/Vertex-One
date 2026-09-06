"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { tache, statutTache } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";

const schemaTache = z.object({
  projetId: z.string(),
  titre: z.string().trim().min(2, "Le titre est trop court."),
  assigneAId: z.string(),
  echeance: z.string().optional(),
});

export type EtatTache = { erreur?: string } | null;

export async function creerTache(_etat: EtatTache, formData: FormData): Promise<EtatTache> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PROJETS", "MODIFIER")) {
    return { erreur: "Vous n'avez pas le droit d'ajouter une tâche." };
  }

  const analyse = schemaTache.safeParse({
    projetId: formData.get("projetId"),
    titre: formData.get("titre"),
    assigneAId: formData.get("assigneAId") || utilisateurConnecte.utilisateurId,
    echeance: formData.get("echeance") || undefined,
  });

  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { projetId, titre, assigneAId, echeance } = analyse.data;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(tache).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      projetId,
      titre,
      assigneAId,
      echeance: echeance ? new Date(echeance) : undefined,
      creeParId: utilisateurConnecte.utilisateurId,
    })
  );

  revalidatePath(`/app/projets/${projetId}`);
  revalidatePath("/app/projets/mes-taches");
  return null;
}

/**
 * termineeLe renseignée/effacée automatiquement selon le statut — jamais
 * saisie manuellement (sert de base au suivi d'équipe du Palier 5).
 */
export async function changerStatutTache(tacheId: string, statut: (typeof statutTache.enumValues)[number]) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PROJETS", "MODIFIER")) return;

  const [laTache] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .update(tache)
      .set({ statut, termineeLe: statut === "TERMINEE" ? new Date() : null })
      .where(eq(tache.id, tacheId))
      .returning({ projetId: tache.projetId })
  );

  if (laTache) revalidatePath(`/app/projets/${laTache.projetId}`);
  revalidatePath("/app/projets/mes-taches");
  revalidatePath("/app");
}

export type EtatAssignation = { erreur?: string } | null;

/**
 * Réservé aux modules qui gèrent l'affectation — un formulaire simple
 * <select> plutôt qu'une UI de type Kanban avec drag&drop, hors scope MVP
 * (voir docs/palier-2-*, section 8 : "kanban" mentionné mais la vue liste +
 * changement de statut par bouton suffit tant qu'aucun utilisateur réel n'a
 * demandé le drag&drop).
 */
export async function reassignerTache(tacheId: string, assigneAId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PROJETS", "MODIFIER")) return;

  const [laTache] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(tache).set({ assigneAId }).where(eq(tache.id, tacheId)).returning({ projetId: tache.projetId })
  );

  if (laTache) revalidatePath(`/app/projets/${laTache.projetId}`);
  revalidatePath("/app/projets/mes-taches");
}

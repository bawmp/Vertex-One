"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise, db } from "@/db/client";
import { session, compte } from "@/db/schema";
import { effacerObjetStockage } from "@/lib/documents/stockage";
import { supprimerFicheCollaborateur } from "@/lib/rh/suppression-fiche";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { getT } from "@/lib/i18n/langue";

/**
 * « Supprimer la fiche » d'un collaborateur (Manager ou Employé, stagiaire embauché compris) : efface définitivement sa fiche RH et ses données
 * personnelles, et retire son accès. Réservé à l'Administrateur, jamais pour soi-même ni pour un autre Administrateur ; refusé si un salaire
 * lui a déjà été payé (voir `supprimerFicheCollaborateur`). Le rôle, le statut et l'entreprise de la cible sont relus en base.
 */
export async function supprimerFicheCollaborateurAction(utilisateurId: string): Promise<{ erreur?: string; ok?: boolean }> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return { erreur: t("Seul l'Administrateur peut supprimer une fiche.") };
  if (String(utilisateurId) === utilisateurConnecte.utilisateurId) return { erreur: t("Vous ne pouvez pas supprimer votre propre fiche.") };

  const r = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => supprimerFicheCollaborateur(tx, utilisateurConnecte.entrepriseId, String(utilisateurId)));
  if (!r.ok) return { erreur: t(r.erreur) };

  // Seulement après la transaction : sessions et mots de passe (tables de Better-Auth), puis les fichiers dans R2 (meilleur effort : un fichier
  // qui ne s'efface pas est journalisé, il ne rend jamais la suppression de la fiche impossible).
  await db.delete(session).where(eq(session.userId, String(utilisateurId)));
  await db.delete(compte).where(eq(compte.userId, String(utilisateurId)));
  for (const cle of r.fichiers) {
    try {
      await effacerObjetStockage(cle);
    } catch (erreur) {
      console.error("[suppression-fiche] fichier non effacé :", erreur instanceof Error ? erreur.message : erreur);
    }
  }

  revalidatePath("/app/rh");
  revalidatePath("/app/parametres/equipe");
  return { ok: true };
}

"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { filtrerModulesAutorises, listeAEnregistrer } from "@/lib/modules-libelles";
import { getT } from "@/lib/i18n/langue";

/**
 * Choisit les modules auxquels un Manager ou un Employé (ou prestataire) a accès.
 * Réservé à l'Administrateur. `modules = null` rétablit tous les modules d'un Manager ; pour un Employé, il ne reste que le socle (fiche, tâches, chat).
 * Ne fait que RESTREINDRE la matrice du rôle (peut() dans src/lib/permissions.ts) :
 * une valeur hors périmètre du rôle est ignorée, jamais accordée. Le rôle et
 * l'entreprise de la cible sont relus en base, jamais pris dans la requête.
 */
export async function definirModulesUtilisateur(utilisateurId: string, modules: string[] | null): Promise<{ erreur?: string } | null> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return { erreur: t("Seul l'Administrateur peut choisir les modules d'un collaborateur.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    // utilisateur reste en RLS permissive (Better-Auth) : le filtre entrepriseId est explicite, pas déduit.
    const [cible] = await tx
      .select({ role: utilisateur.role })
      .from(utilisateur)
      .where(and(eq(utilisateur.id, utilisateurId), eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId)));
    if (!cible) return { erreur: t("Collaborateur introuvable.") };
    if (cible.role !== "MANAGER" && cible.role !== "EMPLOYE") return { erreur: t("Les modules ne se choisissent que pour un Manager ou un Employé.") };

    // Un Employé a toujours une liste explicite (socle + modules accordés) ; pour un Manager, `null` ou une sélection complète = aucune restriction.
    const retenus = modules ? filtrerModulesAutorises(cible.role, modules) : cible.role === "EMPLOYE" ? [] : null;
    const aEnregistrer = retenus ? listeAEnregistrer(cible.role, retenus) : null;

    await tx
      .update(utilisateur)
      .set({ modulesAutorises: aEnregistrer })
      .where(and(eq(utilisateur.id, utilisateurId), eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId)));
    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath("/app/parametres/equipe");
  return null;
}

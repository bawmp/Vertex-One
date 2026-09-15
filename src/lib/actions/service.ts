"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { service, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";

const CHEMIN = "/app/parametres/equipe";

export type EtatService = { erreur?: string } | null;

const schemaService = z.object({
  nom: z.string().trim().min(1, "Le nom est requis."),
});

/** Réservé à l'Administrateur, même niveau que creerCategorieTicketSupport(). */
export async function creerService(_etat: EtatService, formData: FormData): Promise<EtatService> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut créer un département." };
  }

  const analyse = schemaService.safeParse({ nom: formData.get("nom") });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(service).values({ entrepriseId: utilisateurConnecte.entrepriseId, nom: analyse.data.nom })
  );

  revalidatePath(CHEMIN);
  return null;
}

export async function renommerService(_etat: EtatService, formData: FormData): Promise<EtatService> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut renommer un département." };
  }

  const schema = z.object({ serviceId: z.string(), nom: z.string().trim().min(1, "Le nom est requis.") });
  const analyse = schema.safeParse({ serviceId: formData.get("serviceId"), nom: formData.get("nom") });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(service).set({ nom: analyse.data.nom }).where(eq(service.id, analyse.data.serviceId))
  );

  revalidatePath(CHEMIN);
  return null;
}

/**
 * Un département est une étiquette organisationnelle, jamais une frontière
 * de permission (voir src/db/schema.ts, table `service`) — l'archiver ne
 * doit donc jamais casser une référence : les employés qui y étaient
 * rattachés repassent à "Aucun" plutôt que d'empêcher la suppression ou de
 * violer la contrainte de clé étrangère.
 */
export async function archiverService(serviceId: string): Promise<void> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    await tx.update(utilisateur).set({ serviceId: null }).where(eq(utilisateur.serviceId, serviceId));
    await tx.delete(service).where(eq(service.id, serviceId));
  });

  revalidatePath(CHEMIN);
}

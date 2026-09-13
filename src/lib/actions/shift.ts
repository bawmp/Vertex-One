"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise, shift, dossierRH } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponible } from "@/lib/plans";

const CHEMIN = "/app/rh/shifts";

export type EtatShift = { erreur?: string } | null;

const schemaHeure = z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide (HH:MM).");

const schemaShift = z.object({
  nom: z.string().trim().min(1, "Le nom est requis."),
  heureDebut: schemaHeure,
  heureFin: schemaHeure,
  toleranceMinutes: z.coerce.number().int().min(0, "La tolérance doit être positive ou nulle.").default(0),
});

/**
 * Shifts (échange du 2026-09-12) — décision structurante, réservée à
 * l'Administrateur (même niveau que creerPolitiqueConge()/creerSondage()).
 */
export async function creerShift(_etat: EtatShift, formData: FormData): Promise<EtatShift> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut créer un shift." };
  }

  const analyse = schemaShift.safeParse({
    nom: formData.get("nom"),
    heureDebut: formData.get("heureDebut"),
    heureFin: formData.get("heureFin"),
    toleranceMinutes: formData.get("toleranceMinutes") || 0,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { nom, heureDebut, heureFin, toleranceMinutes } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return { erreur: "Les Ressources Humaines sont disponibles à partir du forfait Business." };

    await tx.insert(shift).values({ entrepriseId: utilisateurConnecte.entrepriseId, nom, heureDebut, heureFin, toleranceMinutes, creeParId: utilisateurConnecte.utilisateurId });
    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(CHEMIN);
  return null;
}

/**
 * Désactive plutôt que supprime — même raisonnement que
 * desactiverPolitiqueConge() (src/lib/actions/politique-conge.ts) : un
 * employé déjà assigné garde son historique, jamais une suppression réelle.
 */
export async function desactiverShift(shiftId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(shift).set({ actif: false }).where(eq(shift.id, shiftId)));

  revalidatePath(CHEMIN);
}

const schemaAssignation = z.object({
  dossierRHId: z.string().min(1),
  shiftId: z.string().optional(),
});

export async function assignerShift(_etat: EtatShift, formData: FormData): Promise<EtatShift> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut assigner un shift." };
  }

  const analyse = schemaAssignation.safeParse({ dossierRHId: formData.get("dossierRHId"), shiftId: formData.get("shiftId") || undefined });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { dossierRHId, shiftId } = analyse.data;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(dossierRH).set({ shiftId: shiftId ?? null }).where(eq(dossierRH.id, dossierRHId)));

  revalidatePath(`/app/rh/${dossierRHId}`);
  return null;
}

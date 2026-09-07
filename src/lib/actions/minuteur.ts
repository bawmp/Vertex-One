"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { minuteurActif, entreeTemps, projet } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";

const schemaDemarrer = z.object({
  projetId: z.string().min(1, "Le projet est requis."),
  tacheId: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

export type EtatMinuteur = { erreur?: string } | null;

/**
 * Minuteur démarrer/arrêter (échange du 2026-09-07, comparaison avec la
 * feuille de temps Zoho Books) — un seul minuteur actif par utilisateur
 * (contrainte unique en base, voir schema.ts) : un deuxième démarrage
 * renvoie une erreur plutôt que d'écraser silencieusement celui en cours.
 */
export async function demarrerMinuteur(_etat: EtatMinuteur, formData: FormData): Promise<EtatMinuteur> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PROJETS", "MODIFIER")) {
    return { erreur: "Vous n'avez pas le droit de démarrer un minuteur." };
  }

  const analyse = schemaDemarrer.safeParse({
    projetId: formData.get("projetId"),
    tacheId: formData.get("tacheId") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { projetId, tacheId, note } = analyse.data;

  const erreur = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [existant] = await tx.select({ id: minuteurActif.id }).from(minuteurActif).where(eq(minuteurActif.utilisateurId, utilisateurConnecte.utilisateurId));
    if (existant) return "Un minuteur est déjà en cours — arrêtez-le avant d'en démarrer un nouveau.";

    await tx.insert(minuteurActif).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      utilisateurId: utilisateurConnecte.utilisateurId,
      projetId,
      tacheId: tacheId || undefined,
      note: note || undefined,
    });
    return null;
  });

  if (erreur) return { erreur };

  revalidatePath(`/app/projets/${projetId}`);
  revalidatePath("/app/projets/feuille-temps");
  return null;
}

/**
 * Arrêt du minuteur : crée la véritable entrée de temps (durée = temps
 * écoulé depuis le démarrage, plancher à 0.01h pour ne jamais violer la
 * contrainte "positive" du schéma sur un arrêt quasi immédiat), même
 * simplification que creerEntreeTemps pour le reste des champs
 * (facturable par défaut, taux repris de projet.tauxHoraireParDefaut,
 * aucune ressaisie à l'arrêt — voir src/lib/actions/entree-temps.ts).
 */
export async function arreterMinuteur() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PROJETS", "MODIFIER")) return;

  const projetId = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [actif] = await tx.select().from(minuteurActif).where(eq(minuteurActif.utilisateurId, utilisateurConnecte.utilisateurId));
    if (!actif) return null;

    const [leProjet] = await tx.select({ tauxHoraireParDefaut: projet.tauxHoraireParDefaut }).from(projet).where(eq(projet.id, actif.projetId));

    const heuresEcoulees = (Date.now() - actif.demarreLe.getTime()) / 3_600_000;
    const dureeHeures = Math.max(0.01, Math.round(heuresEcoulees * 100) / 100);

    await tx.insert(entreeTemps).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      projetId: actif.projetId,
      tacheId: actif.tacheId,
      utilisateurId: utilisateurConnecte.utilisateurId,
      date: actif.demarreLe,
      dureeHeures,
      tauxHoraire: leProjet?.tauxHoraireParDefaut ?? 0,
      facturable: true,
      note: actif.note,
    });

    await tx.delete(minuteurActif).where(eq(minuteurActif.id, actif.id));

    return actif.projetId;
  });

  if (projetId) revalidatePath(`/app/projets/${projetId}`);
  revalidatePath("/app/projets/feuille-temps");
}

/** Annule le minuteur en cours sans créer d'entrée — corrige un démarrage par erreur. */
export async function annulerMinuteur() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PROJETS", "MODIFIER")) return;

  const projetId = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [supprime] = await tx
      .delete(minuteurActif)
      .where(eq(minuteurActif.utilisateurId, utilisateurConnecte.utilisateurId))
      .returning({ projetId: minuteurActif.projetId });
    return supprime?.projetId ?? null;
  });

  if (projetId) revalidatePath(`/app/projets/${projetId}`);
  revalidatePath("/app/projets/feuille-temps");
}

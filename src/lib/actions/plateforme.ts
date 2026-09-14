"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { entreprise, journalActionPlateforme } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { estStaffPlateforme, emailStaffCourant } from "@/lib/plateforme/acces";
import { prochaineEcheanceApresPaiement } from "@/lib/abonnement/etat";

/**
 * Console interne plateforme (2026-09-14) — toute écriture passe par
 * avecEntreprise(), exactement comme partout ailleurs dans le produit :
 * jamais via dbPlateforme (lecture seule, imposé par les droits SQL du rôle
 * plateforme_lecture — voir src/db/plateforme.ts).
 *
 * calculerEtatAbonnement() (src/lib/abonnement/etat.ts) recalcule
 * statutAbonnement depuis les deux dates CHAQUE JOUR via la tâche planifiée
 * — une action qui ne toucherait que la colonne statutAbonnement serait
 * silencieusement écrasée le lendemain. Chaque action ci-dessous déplace
 * donc les dates de façon cohérente avec cette logique, jamais dupliquée.
 */
async function garde(): Promise<void> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!(await estStaffPlateforme())) redirect("/app");
}

export async function etendreEssai(entrepriseId: string, jours: number): Promise<{ erreur?: string }> {
  await garde();
  const staffEmail = await emailStaffCourant();

  return avecEntreprise(entrepriseId, async (tx) => {
    const [e] = await tx.select({ essaiFinLe: entreprise.essaiFinLe, abonnementEcheanceLe: entreprise.abonnementEcheanceLe }).from(entreprise).where(eq(entreprise.id, entrepriseId));
    if (!e) return { erreur: "Entreprise introuvable." };
    if (e.abonnementEcheanceLe.getTime() !== e.essaiFinLe.getTime()) {
      return { erreur: "Cette entreprise a déjà réglé au moins un cycle — utilisez plutôt Réactiver." };
    }

    const nouvelleDate = new Date(e.essaiFinLe.getTime() + jours * 24 * 60 * 60 * 1000);
    await tx
      .update(entreprise)
      .set({ essaiFinLe: nouvelleDate, abonnementEcheanceLe: nouvelleDate, dernierRappelAbonnementEnvoye: null })
      .where(eq(entreprise.id, entrepriseId));
    await tx.insert(journalActionPlateforme).values({ entrepriseId, staffEmail, action: "ESSAI_ETENDU", details: `+${jours} jours` });

    return {};
  });
}

export async function reactiverManuellement(entrepriseId: string): Promise<{ erreur?: string }> {
  await garde();
  const staffEmail = await emailStaffCourant();

  return avecEntreprise(entrepriseId, async (tx) => {
    const [e] = await tx.select({ abonnementEcheanceLe: entreprise.abonnementEcheanceLe }).from(entreprise).where(eq(entreprise.id, entrepriseId));
    if (!e) return { erreur: "Entreprise introuvable." };

    const nouvelleEcheance = prochaineEcheanceApresPaiement(e.abonnementEcheanceLe, new Date());
    await tx
      .update(entreprise)
      .set({ abonnementEcheanceLe: nouvelleEcheance, statutAbonnement: "actif", dernierRappelAbonnementEnvoye: null })
      .where(eq(entreprise.id, entrepriseId));
    await tx.insert(journalActionPlateforme).values({ entrepriseId, staffEmail, action: "REACTIVE_MANUELLEMENT" });

    return {};
  });
}

export async function suspendreManuellement(entrepriseId: string): Promise<{ erreur?: string }> {
  await garde();
  const staffEmail = await emailStaffCourant();

  return avecEntreprise(entrepriseId, async (tx) => {
    const [e] = await tx.select({ id: entreprise.id }).from(entreprise).where(eq(entreprise.id, entrepriseId));
    if (!e) return { erreur: "Entreprise introuvable." };

    // Recule l'échéance bien au-delà de la grâce de 48h — le lendemain, le
    // cron recalcule depuis les mêmes dates et retombe sur "suspendu" : la
    // suspension tient, elle ne s'auto-annule pas.
    const dateForcee = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await tx.update(entreprise).set({ abonnementEcheanceLe: dateForcee, statutAbonnement: "suspendu" }).where(eq(entreprise.id, entrepriseId));
    await tx.insert(journalActionPlateforme).values({ entrepriseId, staffEmail, action: "SUSPENDU_MANUELLEMENT" });

    return {};
  });
}

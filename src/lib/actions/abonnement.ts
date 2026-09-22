"use server";

import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { avecEntreprise } from "@/db/client";
import { entreprise, tentativePaiementAbonnement } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { initierPaiement } from "@/lib/aangaraa/client";
import { referenceExterne } from "@/lib/paiement/reference";
import { getT } from "@/lib/i18n/langue";

const PRIX_ABONNEMENT_MENSUEL = 50_000;

function urlBase(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

/**
 * Abonnement plat unique 50 000 FCFA/mois (2026-09-14) — même squelette que
 * genererLienPaiement() (src/lib/actions/facture.ts), mais un flux d'argent
 * différent : le tenant paie ici Vertex One lui-même, jamais un de ses
 * propres clients. Table (tentativePaiementAbonnement) et webhook
 * (src/app/api/paiements/aangaraa/notify/route.ts, distingué par le préfixe de la
 * référence externe) séparés de ceux des factures — deux flux distincts.
 */
export async function genererLienPaiementAbonnement(): Promise<{ url?: string; erreur?: string }> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return { erreur: t("Seul un administrateur peut régler l'abonnement.") };
  }

  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [tentative] = await tx
      .insert(tentativePaiementAbonnement)
      .values({ entrepriseId: utilisateurConnecte.entrepriseId, montant: PRIX_ABONNEMENT_MENSUEL })
      .returning({ id: tentativePaiementAbonnement.id });

    const resultat = await initierPaiement({
      reference: referenceExterne("ABONNEMENT", tentative.id),
      montant: PRIX_ABONNEMENT_MENSUEL,
      description: t("Abonnement Vertex One — mensuel"),
      notifyUrl: `${urlBase()}/api/paiements/aangaraa/notify`,
      returnUrl: `${urlBase()}/app/parametres/abonnement`,
    });

    if (resultat.erreur) return { erreur: resultat.erreur };
    return { url: resultat.url };
  });
}

export type StatutAbonnementAffichage = {
  statutAbonnement: string;
  essaiFinLe: Date;
  abonnementEcheanceLe: Date;
  paiements: { id: string; montant: number; statut: string; creeLe: Date; confirmeLe: Date | null }[];
};

export async function recupererStatutAbonnement(): Promise<StatutAbonnementAffichage | null> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "VOIR")) return null;

  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ statutAbonnement: entreprise.statutAbonnement, essaiFinLe: entreprise.essaiFinLe, abonnementEcheanceLe: entreprise.abonnementEcheanceLe })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!monEntreprise) return null;

    const paiements = await tx
      .select({ id: tentativePaiementAbonnement.id, montant: tentativePaiementAbonnement.montant, statut: tentativePaiementAbonnement.statut, creeLe: tentativePaiementAbonnement.creeLe, confirmeLe: tentativePaiementAbonnement.confirmeLe })
      .from(tentativePaiementAbonnement)
      .where(eq(tentativePaiementAbonnement.entrepriseId, utilisateurConnecte.entrepriseId))
      .orderBy(desc(tentativePaiementAbonnement.creeLe));

    return { ...monEntreprise, paiements };
  });
}

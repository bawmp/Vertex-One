"use server";

import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { avecEntreprise } from "@/db/client";
import { entreprise, tentativePaiementAbonnement, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { initierPaiement } from "@/lib/cinetpay/client";

const PRIX_ABONNEMENT_MENSUEL = 50_000;

function urlBase(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

/**
 * Abonnement plat unique 50 000 FCFA/mois (2026-09-14) — même squelette que
 * genererLienPaiement() (src/lib/actions/facture.ts), mais un flux d'argent
 * différent : le tenant paie ici Vertex One lui-même, jamais un de ses
 * propres clients. Table (tentativePaiementAbonnement) et webhook
 * (src/app/api/paiements/cinetpay/notify-abonnement/route.ts) séparés de
 * ceux des factures — deux flux distincts, pas un mécanisme générique.
 */
export async function genererLienPaiementAbonnement(): Promise<{ url?: string; erreur?: string }> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PARAMETRES", "MODIFIER")) {
    return { erreur: "Seul un administrateur peut régler l'abonnement." };
  }

  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    // UtilisateurConnecte ne porte que utilisateurId/entrepriseId/role
    // (voir src/lib/session.ts) — nomComplet/email se relisent ici, comme le
    // fait déjà src/app/app/layout.tsx pour ses propres besoins.
    const [monUtilisateur] = await tx
      .select({ nomComplet: utilisateur.nomComplet, email: utilisateur.email })
      .from(utilisateur)
      .where(eq(utilisateur.id, utilisateurConnecte.utilisateurId));

    const [tentative] = await tx
      .insert(tentativePaiementAbonnement)
      .values({ entrepriseId: utilisateurConnecte.entrepriseId, montant: PRIX_ABONNEMENT_MENSUEL })
      .returning({ id: tentativePaiementAbonnement.id });

    const resultat = await initierPaiement({
      transactionId: tentative.id,
      montant: PRIX_ABONNEMENT_MENSUEL,
      description: "Abonnement Vertex One — mensuel",
      notifyUrl: `${urlBase()}/api/paiements/cinetpay/notify-abonnement`,
      returnUrl: `${urlBase()}/app/parametres/abonnement`,
      clientNom: monUtilisateur?.nomComplet ?? "Client",
      clientTelephone: "",
      clientEmail: monUtilisateur?.email ?? null,
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
  if (!peut(utilisateurConnecte.role, "PARAMETRES", "VOIR")) return null;

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

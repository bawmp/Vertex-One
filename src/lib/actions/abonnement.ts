"use server";

import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { avecEntreprise } from "@/db/client";
import { entreprise, tentativePaiementAbonnement } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { initierPaiementDirect } from "@/lib/aangaraa/client";
import { referenceExterne } from "@/lib/paiement/reference";
import { telephoneInternational } from "@/lib/paiement/telephone";
import { relireEtConfirmerAbonnement, type StatutRelectureAbonnement } from "@/lib/paiement/confirmation";
import { getT } from "@/lib/i18n/langue";

// ⚠️ TEMPORAIRE — vérification réelle de l'intégration Aangaraa Pay (clé tout juste configurée) : prix ramené à
// 100 XAF le temps du test, à remettre à 50 000 juste après (voir conversation du 2026-09-22).
const PRIX_ABONNEMENT_MENSUEL = 100;

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
 *
 * Paiement direct sans redirection (2026-09-22, correction — la première intégration utilisait le flux avec
 * redirection partout) : le numéro de téléphone est saisi ici même, une invite USSD part directement dessus,
 * jamais de page hébergée externe à ouvrir. Le payToken renvoyé par Aangaraa Pay (s'il y en a un — réponse non
 * documentée) est conservé sur la tentative : la confirmation ne peut PAS compter sur la seule notification
 * asynchrone (constaté en réel : Aangaraa Pay ne l'appelle qu'une fois, immédiatement, transaction encore PENDING —
 * jamais une seconde fois à la validation réelle par le client) — voir verifierStatutTentativeAbonnement() plus bas,
 * sondée depuis l'interface.
 */
export async function declencherPaiementAbonnement(
  telephoneBrut: string,
  operateur: "MTN_Cameroon" | "Orange_Cameroon"
): Promise<{ declenche?: boolean; tentativeId?: string; erreur?: string }> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return { erreur: t("Seul un administrateur peut régler l'abonnement.") };
  }

  const telephone = telephoneInternational(telephoneBrut);
  if (!telephone) return { erreur: t("Numéro de téléphone invalide.") };
  if (operateur !== "MTN_Cameroon" && operateur !== "Orange_Cameroon") return { erreur: t("Choisissez votre opérateur Mobile Money.") };

  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [tentative] = await tx
      .insert(tentativePaiementAbonnement)
      .values({ entrepriseId: utilisateurConnecte.entrepriseId, montant: PRIX_ABONNEMENT_MENSUEL })
      .returning({ id: tentativePaiementAbonnement.id });

    const resultat = await initierPaiementDirect({
      telephone,
      operateur,
      reference: referenceExterne("ABONNEMENT", tentative.id),
      montant: PRIX_ABONNEMENT_MENSUEL,
      description: t("Abonnement Vertex One — mensuel"),
      notifyUrl: `${urlBase()}/api/paiements/aangaraa/notify`,
      returnUrl: `${urlBase()}/app/parametres/abonnement`,
    });

    if (resultat.erreur) return { erreur: resultat.erreur };
    if (resultat.payToken) await tx.update(tentativePaiementAbonnement).set({ payToken: resultat.payToken }).where(eq(tentativePaiementAbonnement.id, tentative.id));
    return { declenche: true, tentativeId: tentative.id };
  });
}

/**
 * Sondée depuis l'interface après déclenchement du paiement (voir bouton-paiement-abonnement.tsx) : relit
 * activement le statut chez Aangaraa Pay au lieu d'attendre passivement une notification qui ne revient pas une
 * seconde fois pour ce parcours. Vérifie que la tentative appartient bien à l'entreprise de l'appelant avant de
 * relire quoi que ce soit — jamais un identifiant de tentative d'une autre entreprise pris tel quel.
 */
export async function verifierStatutTentativeAbonnement(tentativeId: string): Promise<StatutRelectureAbonnement> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [tentative] = await tx.select({ id: tentativePaiementAbonnement.id }).from(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.id, tentativeId));
    if (!tentative) return "INTROUVABLE" as const;
    return relireEtConfirmerAbonnement(tentativeId);
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

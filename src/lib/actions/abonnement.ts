"use server";

import { eq, desc, and, gt, isNotNull } from "drizzle-orm";
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

// Prix réel de l'abonnement plat mensuel (2026-09-14). Temporairement ramené à 10 XAF le 2026-09-22/23 pour
// vérifier l'intégration Aangaraa Pay avec de l'argent réel — restauré à 50 000 le 2026-09-23, tests terminés.
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
      description: t("Abonnement Vertex One"),
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

/**
 * Reprise après rechargement de page (2026-09-23) : le sondage vit uniquement en état React côté client
 * (bouton-paiement-abonnement.tsx) — si l'onglet est déchargé pendant que le client bascule sur son téléphone
 * pour valider l'invite USSD (comportement réel constaté sur mobile : l'onglet en arrière-plan est parfois
 * déchargé par le système, pas seulement mis en pause), tout l'état de sondage est perdu au retour, y compris
 * pour un paiement pourtant déjà réussi côté Aangaraa Pay. Appelée au chargement de l'écran d'abonnement : si une
 * tentative récente (moins de 10 minutes, avec payToken) est encore EN_ATTENTE, l'interface reprend le sondage
 * automatiquement au lieu de réafficher un formulaire vierge qui masque un paiement en cours ou déjà confirmé.
 */
export async function recupererTentativeAbonnementEnAttente(): Promise<{ tentativeId: string } | null> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const seuil = new Date(Date.now() - 10 * 60 * 1000);
    const [tentative] = await tx
      .select({ id: tentativePaiementAbonnement.id })
      .from(tentativePaiementAbonnement)
      .where(and(eq(tentativePaiementAbonnement.statut, "EN_ATTENTE"), isNotNull(tentativePaiementAbonnement.payToken), gt(tentativePaiementAbonnement.creeLe, seuil)))
      .orderBy(desc(tentativePaiementAbonnement.creeLe))
      .limit(1);
    return tentative ? { tentativeId: tentative.id } : null;
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

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
import { montantEtMois, tarifPour, type TarifAbonnement } from "@/lib/abonnement/tarif";

// Prix : voir src/lib/abonnement/tarif.ts (prix mensuel, prix de lancement garanti 12 mois, formule annuelle). Historique : temporairement
// ramené à 10 XAF le 2026-09-22/23 pour vérifier l'intégration Aangaraa Pay avec de l'argent réel, restauré à 50 000 le 2026-09-23, puis
// passé à 25 000 FCFA/mois le 2026-10-30 (décision de l'utilisateur).

function urlBase(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

/**
 * Abonnement plat unique 25 000 FCFA/mois (2026-09-14) — même squelette que
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
  operateur: "MTN_Cameroon" | "Orange_Cameroon",
  formule: "mensuel" | "annuel" = "mensuel"
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
    // Le montant et la durée sont décidés ICI, depuis la date de création de l'entreprise (garantie de prix de lancement) : jamais un
    // montant ni un nombre de mois venu du navigateur — `formule` n'est qu'un choix parmi deux valeurs, tout le reste retombe sur « mensuel ».
    const [monEntreprise] = await tx.select({ creeLe: entreprise.creeLe }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!monEntreprise) return { erreur: t("Impossible de récupérer le statut de l'abonnement.") };
    const choix = montantEtMois(tarifPour(monEntreprise.creeLe, new Date()), formule);

    const [tentative] = await tx
      .insert(tentativePaiementAbonnement)
      .values({ entrepriseId: utilisateurConnecte.entrepriseId, montant: choix.montant, mois: choix.mois })
      .returning({ id: tentativePaiementAbonnement.id });

    const resultat = await initierPaiementDirect({
      telephone,
      operateur,
      reference: referenceExterne("ABONNEMENT", tentative.id),
      montant: choix.montant,
      description: t("Abonnement Vertex One"),
      notifyUrl: `${urlBase()}/api/paiements/aangaraa/notify`,
      returnUrl: `${urlBase()}/app/parametres/abonnement`,
    });

    if (resultat.erreur) {
    // Résultat incertain : pendant l'attente, la notification du prestataire a peut-être déjà apporté le jeton — alors le paiement est bien
    // lancé et on continue comme après un succès. Sinon la tentative reste EN ATTENTE (jamais « échec » : le client est peut-être débité) et la
    // notification, si elle arrive plus tard, la rattrapera (voir confirmation.ts).
      const [apres] = resultat.incertain ? await tx.select({ payToken: tentativePaiementAbonnement.payToken }).from(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.id, tentative.id)) : [];
      if (!apres?.payToken) return { erreur: resultat.erreur };
      return { declenche: true, tentativeId: tentative.id };
    }
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
 * Raison de l'échec d'une tentative (solde insuffisant, expirée, annulée…), pour l'expliquer au client. Lecture
 * scopée à l'entreprise connectée : une tentative d'une autre entreprise donne null, comme une tentative inconnue.
 */
export async function lireRaisonEchecAbonnement(tentativeId: string): Promise<string | null> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [tentative] = await tx.select({ raison: tentativePaiementAbonnement.raisonEchec }).from(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.id, tentativeId));
    return tentative?.raison ?? null;
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
  paiements: { id: string; montant: number; mois: number; statut: string; creeLe: Date; confirmeLe: Date | null }[];
  tarif: TarifAbonnement;
};

export async function recupererStatutAbonnement(): Promise<StatutAbonnementAffichage | null> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "VOIR")) return null;

  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ statutAbonnement: entreprise.statutAbonnement, essaiFinLe: entreprise.essaiFinLe, abonnementEcheanceLe: entreprise.abonnementEcheanceLe, creeLe: entreprise.creeLe })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!monEntreprise) return null;

    const paiements = await tx
      .select({ id: tentativePaiementAbonnement.id, montant: tentativePaiementAbonnement.montant, mois: tentativePaiementAbonnement.mois, statut: tentativePaiementAbonnement.statut, creeLe: tentativePaiementAbonnement.creeLe, confirmeLe: tentativePaiementAbonnement.confirmeLe })
      .from(tentativePaiementAbonnement)
      .where(eq(tentativePaiementAbonnement.entrepriseId, utilisateurConnecte.entrepriseId))
      .orderBy(desc(tentativePaiementAbonnement.creeLe));

    const { creeLe, ...etat } = monEntreprise;
    return { ...etat, paiements, tarif: tarifPour(creeLe, new Date()) };
  });
}

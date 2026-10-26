import { and, eq, gt } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { entreprise, facture, tentativePaiementFacture } from "@/db/schema";
import { disponible } from "@/lib/plans";
import { DELAI_RESERVATION_TENTATIVE_MS, determinerMontantTranche, lireSolde } from "@/lib/facturation/solde";
import { initierPaiementDirect } from "@/lib/aangaraa/client";
import { referenceExterne } from "@/lib/paiement/reference";
import { telephoneInternational } from "@/lib/paiement/telephone";

/**
 * Déclenche le paiement direct (sans redirection, `/no_redirect/payment`) d'une facture : une invite USSD part sur le téléphone du
 * payeur, qui valide sur son appareil (forfait Pro et au-dessus, clé Aangaraa Pay configurée). Partagée entre le bouton interne
 * « Encaisser par Mobile Money » (src/lib/actions/facture.ts) et le paiement par le client depuis son lien public
 * (src/lib/actions/client-documents.ts). Même principe que l'abonnement (src/lib/actions/abonnement.ts).
 *
 * Une ligne tentativePaiementFacture est créée AVANT l'appel à Aangaraa Pay — son id (préfixé, voir referenceExterne()) sert de
 * référence externe (jamais l'id de la Facture, transmis à un service externe partagé entre entreprises clientes) et d'ancrage au
 * webhook. Le payToken renvoyé à l'initiation est conservé sur la tentative : la confirmation ne peut pas compter sur la seule
 * notification (rappelée une seule fois, transaction encore PENDING) — voir relireEtConfirmerFacture() dans @/lib/paiement/confirmation.
 *
 * Rappel CLAUDE.md : le paiement Mobile Money n'est jamais présenté comme « instantané » ou « direct » côté promesse de reversement.
 */
function urlBase(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

/** Garde-fou contre l'envoi répété d'invites sur le téléphone de quelqu'un (le lien public d'une facture est connu de son destinataire). */
const DELAI_ENTRE_TENTATIVES_MS = 90_000;
const TENTATIVES_MAX_PAR_HEURE = 5;

export type OperateurMobileMoney = "MTN_Cameroon" | "Orange_Cameroon";

export function operateurValide(valeur: unknown): valeur is OperateurMobileMoney {
  return valeur === "MTN_Cameroon" || valeur === "Orange_Cameroon";
}

export async function declencherPaiementDirectFacture(
  tx: TransactionDrizzle,
  /** `montant` : la tranche choisie par le payeur (FCFA, entier) ; absent = tout le solde restant. Jamais pris tel quel : voir determinerMontantTranche(). */
  params: { entrepriseId: string; factureId: string; returnUrl: string; telephone: string; operateur: unknown; montant?: unknown },
): Promise<{ tentativeId?: string; montant?: number; erreur?: string }> {
  const { entrepriseId, factureId, returnUrl } = params;

  const telephone = telephoneInternational(params.telephone);
  if (!telephone) return { erreur: "Numéro de téléphone invalide." };
  if (!operateurValide(params.operateur)) return { erreur: "Choisissez votre opérateur Mobile Money." };
  const operateur = params.operateur;

  const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (!disponible(monEntreprise, "PAIEMENTS_EN_LIGNE")) {
    return { erreur: "Le paiement en ligne est disponible à partir du forfait Pro." };
  }

  // Toujours relue en base (RLS de l'entreprise) : le montant ne vient jamais du navigateur.
  const [laFacture] = await tx.select().from(facture).where(eq(facture.id, factureId));
  if (!laFacture || laFacture.statut === "PAYEE" || laFacture.statut === "ANNULEE") {
    return { erreur: "Cette facture n'est plus en attente de règlement." };
  }

  const recentes = await tx
    .select({ statut: tentativePaiementFacture.statut, creeLe: tentativePaiementFacture.creeLe, montant: tentativePaiementFacture.montant })
    .from(tentativePaiementFacture)
    .where(and(eq(tentativePaiementFacture.factureId, factureId), gt(tentativePaiementFacture.creeLe, new Date(Date.now() - 3_600_000))));
  if (recentes.some((r) => r.statut === "EN_ATTENTE" && Date.now() - r.creeLe.getTime() < DELAI_ENTRE_TENTATIVES_MS)) {
    return { erreur: "Un paiement est déjà en cours pour cette facture : validez-le sur votre téléphone ou patientez un instant." };
  }
  if (recentes.length >= TENTATIVES_MAX_PAR_HEURE) {
    return { erreur: "Trop de tentatives de paiement pour cette facture. Réessayez dans une heure ou contactez l'entreprise." };
  }

  // Le montant de la tentative : une tranche choisie ou tout le solde, toujours borné par ce qui reste réellement dû (règlements lus
  // en base) moins ce que d'autres tentatives encore en attente ont déjà réservé.
  const { solde } = await lireSolde(tx, factureId, laFacture.montantTTC);
  if (solde <= 0) return { erreur: "Cette facture est déjà entièrement réglée." };
  const reserve = recentes
    .filter((r) => r.statut === "EN_ATTENTE" && Date.now() - r.creeLe.getTime() < DELAI_RESERVATION_TENTATIVE_MS)
    .reduce((somme, r) => somme + r.montant, 0);
  const choix = determinerMontantTranche({ solde, reserve, montantDemande: params.montant, tranchesAutorisees: monEntreprise.paiementEnTranches });
  if ("erreur" in choix) return { erreur: choix.erreur };
  const montant = choix.montant;

  const [tentative] = await tx
    .insert(tentativePaiementFacture)
    .values({ entrepriseId, factureId, montant })
    .returning({ id: tentativePaiementFacture.id });

  const resultat = await initierPaiementDirect({
    telephone,
    operateur,
    reference: referenceExterne("FACTURE", tentative.id),
    montant,
    description: montant < laFacture.montantTTC ? `Facture ${laFacture.numero} (tranche)` : `Facture ${laFacture.numero}`,
    notifyUrl: `${urlBase()}/api/paiements/aangaraa/notify`,
    returnUrl,
  });

  if (resultat.erreur) {
    // Résultat incertain : pendant l'attente, la notification du prestataire a peut-être déjà apporté le jeton — alors le paiement est bien
    // lancé et on continue comme après un succès. Sinon la tentative reste EN ATTENTE (jamais « échec » : le client est peut-être débité) et la
    // notification, si elle arrive plus tard, la rattrapera (voir confirmation.ts).
    const [apres] = resultat.incertain ? await tx.select({ payToken: tentativePaiementFacture.payToken }).from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, tentative.id)) : [];
    if (!apres?.payToken) {
      if (!resultat.incertain) await tx.update(tentativePaiementFacture).set({ statut: "ECHEC" }).where(eq(tentativePaiementFacture.id, tentative.id));
      return { erreur: resultat.erreur };
    }
    return { tentativeId: tentative.id, montant };
  }
  if (resultat.payToken) await tx.update(tentativePaiementFacture).set({ payToken: resultat.payToken }).where(eq(tentativePaiementFacture.id, tentative.id));
  return { tentativeId: tentative.id, montant };
}

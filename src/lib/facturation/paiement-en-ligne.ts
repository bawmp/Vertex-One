import { and, eq, gt } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { entreprise, facture, tentativePaiementFacture } from "@/db/schema";
import { disponible } from "@/lib/plans";
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
  params: { entrepriseId: string; factureId: string; returnUrl: string; telephone: string; operateur: unknown },
): Promise<{ tentativeId?: string; erreur?: string }> {
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
    .select({ statut: tentativePaiementFacture.statut, creeLe: tentativePaiementFacture.creeLe })
    .from(tentativePaiementFacture)
    .where(and(eq(tentativePaiementFacture.factureId, factureId), gt(tentativePaiementFacture.creeLe, new Date(Date.now() - 3_600_000))));
  if (recentes.some((r) => r.statut === "EN_ATTENTE" && Date.now() - r.creeLe.getTime() < DELAI_ENTRE_TENTATIVES_MS)) {
    return { erreur: "Un paiement est déjà en cours pour cette facture : validez-le sur votre téléphone ou patientez un instant." };
  }
  if (recentes.length >= TENTATIVES_MAX_PAR_HEURE) {
    return { erreur: "Trop de tentatives de paiement pour cette facture. Réessayez dans une heure ou contactez l'entreprise." };
  }

  const [tentative] = await tx
    .insert(tentativePaiementFacture)
    .values({ entrepriseId, factureId, montant: laFacture.montantTTC })
    .returning({ id: tentativePaiementFacture.id });

  const resultat = await initierPaiementDirect({
    telephone,
    operateur,
    reference: referenceExterne("FACTURE", tentative.id),
    montant: laFacture.montantTTC,
    description: `Facture ${laFacture.numero}`,
    notifyUrl: `${urlBase()}/api/paiements/aangaraa/notify`,
    returnUrl,
  });

  if (resultat.erreur) {
    await tx.update(tentativePaiementFacture).set({ statut: "ECHEC" }).where(eq(tentativePaiementFacture.id, tentative.id));
    return { erreur: resultat.erreur };
  }
  if (resultat.payToken) await tx.update(tentativePaiementFacture).set({ payToken: resultat.payToken }).where(eq(tentativePaiementFacture.id, tentative.id));
  return { tentativeId: tentative.id };
}

import "server-only";
import { idTransactionExterne, analyserIdTransactionExterne, moyenPaiementDepuisOperateur } from "./utilitaires";

export { idTransactionExterne, analyserIdTransactionExterne, moyenPaiementDepuisOperateur };

// CinetPay (choisi le 2026-09-14 à la place de NotchPay, retour explicite de
// l'utilisateur — voir docs/strategie-suite-locale-entreprises-services.md,
// section 4, pour l'historique du choix initial et le compromis inverse
// assumé ici : commission plus élevée chez CinetPay, ~1,5-3,5% contre ~1%
// chez NotchPay). Même traitement que Migadu/Resend/R2 avant configuration
// (voir CLAUDE.md) : le code réel est en place, mais aucun appel n'a lieu
// tant que CINETPAY_APIKEY/CINETPAY_SITE_ID ne sont pas configurées.
//
// Modèle custodial avec délai de reversement (8 jours par défaut, réductible
// sur demande auprès de CinetPay après KYC) — ne jamais présenter ce lien de
// paiement comme un encaissement "instantané" ou "direct" (voir CLAUDE.md).
const CINETPAY_APIKEY = process.env.CINETPAY_APIKEY;
const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID;

const BASE_URL = "https://api-checkout.cinetpay.com/v2";

export function cinetpayConfigure(): boolean {
  return Boolean(CINETPAY_APIKEY && CINETPAY_SITE_ID);
}

export type InitierPaiementParams = {
  transactionId: string; // id de tentativePaiementFacture — jamais l'id de la Facture elle-même transmis à un tiers
  montant: number; // FCFA, entier
  description: string;
  notifyUrl: string;
  returnUrl: string;
  clientNom: string;
  clientTelephone: string;
  clientEmail: string | null;
};

export type ResultatInitiation = { url: string; erreur?: undefined } | { url?: undefined; erreur: string };

/**
 * Initie un paiement Mobile Money — retourne l'URL de paiement CinetPay vers
 * laquelle rediriger le navigateur du client. Ne lève jamais d'exception :
 * une erreur réseau/API se traduit toujours par { erreur }, jamais un crash
 * de la Server Action appelante (genererLienPaiement()).
 */
export async function initierPaiement(params: InitierPaiementParams): Promise<ResultatInitiation> {
  if (!cinetpayConfigure()) {
    return { erreur: "Intégration CinetPay non configurée pour le moment — utilisez l'encaissement manuel." };
  }

  try {
    const reponse = await fetch(`${BASE_URL}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey: CINETPAY_APIKEY,
        site_id: CINETPAY_SITE_ID,
        transaction_id: params.transactionId,
        amount: params.montant,
        currency: "XAF",
        description: params.description.slice(0, 255),
        channels: "MOBILE_MONEY",
        notify_url: params.notifyUrl,
        return_url: params.returnUrl,
        customer_name: params.clientNom.slice(0, 100) || "Client",
        customer_surname: "-",
        customer_email: params.clientEmail ?? "client@vertexone.cm",
        customer_phone_number: params.clientTelephone,
      }),
    });
    const donnees = await reponse.json();

    if (donnees.code !== "201" && donnees.code !== 201) {
      console.error("[cinetpay] échec d'initiation de paiement :", donnees.code, donnees.message);
      return { erreur: "Impossible de générer le lien de paiement pour le moment." };
    }
    return { url: donnees.data.payment_url };
  } catch (erreur) {
    console.error("[cinetpay] erreur réseau à l'initiation :", erreur instanceof Error ? erreur.message : erreur);
    return { erreur: "Impossible de contacter le service de paiement pour le moment." };
  }
}

export type StatutCinetpay = "ACCEPTED" | "REFUSED" | "PENDING" | "CANCELLED" | "INCONNU";

export type ResultatVerification = { statut: StatutCinetpay; montant?: number; operateur?: string };

/**
 * Vérifie le statut réel d'une transaction directement auprès de CinetPay —
 * jamais faire confiance au seul contenu du webhook de notification (voir
 * docs.cinetpay.com : "CinetPay will not send you the transaction status
 * information to avoid... man in the middle" — le webhook ne sert qu'à
 * déclencher cette vérification, jamais de source de vérité lui-même).
 */
export async function verifierTransaction(transactionId: string): Promise<ResultatVerification> {
  if (!cinetpayConfigure()) return { statut: "INCONNU" };

  try {
    const reponse = await fetch(`${BASE_URL}/payment/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: CINETPAY_APIKEY, site_id: CINETPAY_SITE_ID, transaction_id: transactionId }),
    });
    const donnees = await reponse.json();
    const statut: StatutCinetpay = donnees?.data?.status ?? "INCONNU";
    return { statut, montant: donnees?.data?.amount, operateur: donnees?.data?.payment_method };
  } catch (erreur) {
    console.error("[cinetpay] erreur réseau à la vérification :", erreur instanceof Error ? erreur.message : erreur);
    return { statut: "INCONNU" };
  }
}

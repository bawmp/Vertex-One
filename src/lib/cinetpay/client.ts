import "server-only";
import { CinetPayClient, ApiError } from "cinetpay-js";
import { moyenPaiementDepuisOperateur, telephoneInternational } from "./utilitaires";

export { moyenPaiementDepuisOperateur };

// CinetPay (choisi le 2026-09-14 à la place de NotchPay, retour explicite de
// l'utilisateur — voir docs/strategie-suite-locale-entreprises-services.md,
// section 4). Migré le 2026-09-18 vers le package officiel `cinetpay-js`
// (API v1, https://github.com/cinetpay/cinetpay-js) à la demande explicite
// de l'utilisateur — toujours un flux de redirection (payment_url), jamais
// un widget embarqué : cinetpay-js est un SDK serveur, pas un SDK client.
//
// Identifiants par pays (credentials: Record<pays, {apiKey, apiPassword}>)
// — Vertex One n'opère qu'au Cameroun pour l'instant, d'où un seul pays en
// dur. À généraliser en vraie map multi-pays seulement si un second pays
// devient réellement nécessaire.
//
// Modèle custodial avec délai de reversement (8 jours par défaut, réductible
// sur demande auprès de CinetPay après KYC) — ne jamais présenter ce lien de
// paiement comme un encaissement "instantané" ou "direct" (voir CLAUDE.md).
const PAYS = "CM";
const CINETPAY_APIKEY = process.env.CINETPAY_APIKEY;
const CINETPAY_APIPASSWORD = process.env.CINETPAY_APIPASSWORD;

export function cinetpayConfigure(): boolean {
  return Boolean(CINETPAY_APIKEY && CINETPAY_APIPASSWORD);
}

function client(): CinetPayClient {
  return new CinetPayClient({ credentials: { [PAYS]: { apiKey: CINETPAY_APIKEY!, apiPassword: CINETPAY_APIPASSWORD! } } });
}

export type InitierPaiementParams = {
  // = id de tentativePaiementFacture/tentativePaiementAbonnement (cuid2, 24
  // caractères) — utilisé tel quel comme merchantTransactionId, jamais
  // préfixé par l'entrepriseId (l'API v1 de CinetPay impose une limite de 30
  // caractères, incompatible avec l'ancien préfixage). Le webhook retrouve
  // l'entrepriseId par une lecture RLS anonyme dédiée — voir le commentaire
  // sur tentativePaiementFacture dans src/db/schema.ts.
  transactionId: string;
  montant: number; // FCFA, entier (l'API accepte 100 à 2 500 000)
  description: string;
  notifyUrl: string;
  returnUrl: string; // sert à la fois de successUrl et de failedUrl — pas de distinction dans notre UI aujourd'hui
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

  // clientFirstName/clientLastName sont exigés séparément par l'API — notre
  // schéma (contact.nom) ne stocke qu'un nom complet libre, d'où ce
  // découpage best-effort (premier mot = prénom, reste = nom de famille).
  const motsNom = params.clientNom.trim().split(/\s+/).filter(Boolean);
  const prenom = motsNom[0] || "Client";
  const nomFamille = motsNom.slice(1).join(" ") || prenom;

  try {
    const reponse = await client().payment.initialize(
      {
        currency: "XAF",
        merchantTransactionId: params.transactionId,
        amount: params.montant,
        lang: "fr",
        designation: params.description.slice(0, 255),
        clientEmail: params.clientEmail ?? "client@vertexone.cm",
        clientFirstName: prenom,
        clientLastName: nomFamille,
        clientPhoneNumber: telephoneInternational(params.clientTelephone) || undefined,
        successUrl: params.returnUrl.slice(0, 120),
        failedUrl: params.returnUrl.slice(0, 120),
        notifyUrl: params.notifyUrl.slice(0, 120),
        channel: "PUSH",
      },
      PAYS
    );
    return { url: reponse.paymentUrl };
  } catch (erreur) {
    console.error("[cinetpay] échec d'initiation de paiement :", erreur instanceof Error ? erreur.message : erreur);
    return { erreur: "Impossible de générer le lien de paiement pour le moment." };
  }
}

export type StatutCinetpay = "ACCEPTED" | "REFUSED" | "PENDING" | "CANCELLED" | "INCONNU";

export type ResultatVerification = { statut: StatutCinetpay };

/**
 * Vérifie le statut réel d'une transaction directement auprès de CinetPay —
 * jamais faire confiance au seul contenu du webhook de notification (voir
 * docs.cinetpay.com : le webhook ne sert qu'à déclencher cette vérification,
 * jamais de source de vérité lui-même).
 */
export async function verifierTransaction(transactionId: string): Promise<ResultatVerification> {
  if (!cinetpayConfigure()) return { statut: "INCONNU" };

  try {
    const statut = await client().payment.getStatus(transactionId, PAYS);
    return { statut: mapperStatut(statut.status) };
  } catch (erreur) {
    if (erreur instanceof ApiError && erreur.apiStatus === "NOT_FOUND") return { statut: "INCONNU" };
    console.error("[cinetpay] erreur réseau à la vérification :", erreur instanceof Error ? erreur.message : erreur);
    return { statut: "INCONNU" };
  }
}

function mapperStatut(status: string): StatutCinetpay {
  if (status === "SUCCESS") return "ACCEPTED";
  if (status === "FAILED") return "REFUSED";
  if (status === "EXPIRED") return "CANCELLED";
  if (status === "PENDING" || status === "INITIATED") return "PENDING";
  return "INCONNU";
}

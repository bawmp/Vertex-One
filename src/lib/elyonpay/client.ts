import "server-only";
import type { ResultatVerification } from "@/lib/paiement/types";
import { analyserReponseTransaction, codeMethodePaiement, identifiantTransactionValide, lireIdentifiantTransaction, masquerCle, moyenPaiementDepuisOperateur, type OperateurMobileMoney } from "./utilitaires";

export { moyenPaiementDepuisOperateur };

// ElyonPay (Mobile Money MTN/Orange, choisi le 2026-11-05 à la place d'Aangaraa Pay). API REST, authentification par clé d'API serveur à
// serveur : `Authorization: Bearer <clé>`. Documentation : https://docs.elyonpay.com/fr/documentation/
//
// ⚠️ ELYONPAY_API_KEY est un secret qui donne accès au compte marchand : jamais dans le dépôt, une conversation ou un journal. Ce module
// n'écrit JAMAIS un en-tête ni un corps de requête dans les logs, et masque la clé dans tout message d'erreur qu'il consigne.
//
// Variables : ELYONPAY_API_KEY (obligatoire), ELYONPAY_MERCHANT_ID (identifiant entier du marchand, obligatoire), ELYONPAY_MERCHANT_NAME
// (nom affiché au payeur), ELYONPAY_API_URL (défaut : la production ; https://api.elyonpay.net/api pour le bac à sable),
// ELYONPAY_METHODE_MTN / ELYONPAY_METHODE_ORANGE (codes `payment_method`, voir codeMethodePaiement()).
//
// Rappel CLAUDE.md : le paiement Mobile Money n'est jamais présenté comme « instantané » ou « direct » côté reversement — les fonds sont
// reversés à l'entreprise avec un délai, dont le nombre de jours n'est pas annoncé tant que le prestataire ne l'a pas confirmé.
const API_PAR_DEFAUT = "https://api.elyonpay.org/api";
const DELAI_MS = 15_000;
const DELAI_INITIATION_MS = 30_000; // l'invite USSD part avant la réponse : on laisse le temps au prestataire plutôt que de conclure trop vite à un échec

function urlApi(): string {
  return (process.env.ELYONPAY_API_URL || API_PAR_DEFAUT).replace(/\/+$/, "");
}

export function elyonpayConfigure(): boolean {
  const marchand = Number(process.env.ELYONPAY_MERCHANT_ID);
  return Boolean(process.env.ELYONPAY_API_KEY) && Number.isInteger(marchand) && marchand > 0;
}

type ReponseApi = { statut: number; corps: unknown };

/** Erreurs qui prouvent que la requête n'est JAMAIS arrivée chez le prestataire (adresse introuvable, connexion refusée) : la rejouer est sans risque. */
const ERREURS_AVANT_ENVOI = new Set(["ENOTFOUND", "ECONNREFUSED", "EAI_AGAIN", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"]);

function codeErreur(erreur: unknown): string | undefined {
  const e = erreur as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.cause?.code ?? e?.code;
  return typeof code === "string" ? code : undefined;
}

type ResultatAppel = { reponse: ReponseApi } | { reponse: null; avantEnvoi: boolean };

/**
 * Un appel avec une nouvelle tentative sur erreur réseau. `reessayerSiIncertain: false` pour une opération qui DÉPLACE de l'argent
 * (déclencher un paiement) : après un délai dépassé ou une coupure en cours de route, le prestataire a peut-être déjà traité la demande —
 * la rejouer risquerait un second prélèvement. Seule une erreur qui prouve que la requête n'est jamais partie est alors rejouée.
 */
async function appelerBrut(methode: "GET" | "POST", chemin: string, corps?: Record<string, unknown>, options: { delaiMs?: number; reessayerSiIncertain?: boolean } = {}): Promise<ResultatAppel> {
  const { delaiMs = DELAI_MS, reessayerSiIncertain = true } = options;
  let avantEnvoi = false;
  for (let essai = 0; essai < 2; essai++) {
    const debut = Date.now();
    try {
      const reponse = await fetch(`${urlApi()}${chemin}`, {
        method: methode,
        headers: { Authorization: `Bearer ${process.env.ELYONPAY_API_KEY}`, Accept: "application/json", ...(corps ? { "Content-Type": "application/json" } : {}) },
        body: corps ? JSON.stringify(corps) : undefined,
        signal: AbortSignal.timeout(delaiMs),
      });
      let json: unknown = null;
      try {
        json = await reponse.json();
      } catch {
        json = null;
      }
      if (methode === "POST") console.log(`[elyonpay] ${chemin} : HTTP ${reponse.status} en ${((Date.now() - debut) / 1000).toFixed(1)} s`);
      return { reponse: { statut: reponse.status, corps: json } };
    } catch (erreur) {
      const code = codeErreur(erreur);
      avantEnvoi = code !== undefined && ERREURS_AVANT_ENVOI.has(code);
      console.error(
        `[elyonpay] erreur réseau sur ${methode} ${chemin.replace(/\/[^/]+$/, "/…")} (essai ${essai + 1}/2, après ${((Date.now() - debut) / 1000).toFixed(1)} s, ${avantEnvoi ? "requête non partie" : "résultat incertain"}) :`,
        erreur instanceof Error ? masquerCle(erreur.message, process.env.ELYONPAY_API_KEY) : erreur,
      );
      if (!avantEnvoi && !reessayerSiIncertain) break;
    }
  }
  return { reponse: null, avantEnvoi };
}

export type InitierPaiementDirectParams = {
  /** Référence externe (voir referenceExterne() dans @/lib/paiement/reference) — jamais un identifiant métier. Non transmise à ElyonPay (voir initierPaiementDirect). */
  reference: string;
  montant: number; // FCFA, entier
  /** Conservé pour l'appelant ; l'API de paiement Mobile Money d'ElyonPay n'a pas de champ de description. */
  description?: string;
  /** Format international obligatoire (+237…) — voir telephoneInternational() dans @/lib/paiement/telephone. */
  telephone: string;
  /** Choisi par le payeur dans notre interface, jamais deviné depuis le préfixe du numéro (risque d'erreur avec de l'argent réel). */
  operateur: OperateurMobileMoney;
  /** Langue de l'invite (« fr » par défaut). */
  langue?: "fr" | "en";
};

/** Montré au client quand on ne sait pas si le prestataire a traité la demande : jamais « échec » (il a peut-être déjà été débité). */
export const MESSAGE_PAIEMENT_INCERTAIN =
  "Nous n'avons pas pu confirmer votre paiement. Si une demande est arrivée sur votre téléphone, ne payez pas une seconde fois : contactez-nous, nous vérifions et nous vous répondons rapidement.";

export type ResultatInitiationDirecte =
  | { declenche: true; payToken: string | null; erreur?: undefined; incertain?: undefined }
  | { declenche?: undefined; payToken?: undefined; erreur: string; incertain?: true };

/**
 * Déclenche un paiement Mobile Money (`POST /mobile-money/payment/request`) : ElyonPay envoie une invite USSD directement au téléphone
 * du payeur, qui valide sur son appareil — jamais de page hébergée à ouvrir. Notre référence (`reference`) n'est pas transmise (voir le commentaire du corps).
 *
 * La réponse réelle (vérifiée le 2026-11-05) est `{ success, data: { PSPid, PSPnotifyId, PSPtxnId, url, uuid, … } }` : on en extrait l'identifiant de la transaction (`data.uuid`) pour relire ensuite son état
 * (`verifierTransaction`). Il est renvoyé dans `payToken` (nom historique de la colonne `pay_token`). Aucun webhook n'est documenté pour ce
 * mode : la confirmation repose sur la relecture active (sondage de l'écran, puis réconciliation serveur toutes les minutes).
 */
export async function initierPaiementDirect(params: InitierPaiementDirectParams): Promise<ResultatInitiationDirecte> {
  if (!elyonpayConfigure()) return { erreur: "Intégration ElyonPay non configurée pour le moment — utilisez l'encaissement manuel." };

  const appel = await appelerBrut(
    "POST",
    "/mobile-money/payment/request",
    {
      amount: params.montant,
      user_lang: params.langue ?? "fr",
      merchant_name: process.env.ELYONPAY_MERCHANT_NAME?.trim() || "Vertex One",
      merchant_id: Number(process.env.ELYONPAY_MERCHANT_ID),
      currency: "XAF",
      country_name: "Cameroon",
      payment_method: codeMethodePaiement(params.operateur),
      // Constaté en réel le 2026-11-05 : le champ s'appelle `customer_msisdn` (le tableau de la documentation dit `msisdn` : refusé, « payload.customer.msisdn
      // cannot be empty »). Et `transaction` n'est PAS une référence externe : ElyonPay y lit l'`uuid` d'une transaction existante (404 « Transaction with
      // uuid [...] not found » sinon) — il ne faut donc jamais l'envoyer. Notre référence n'est pas transmise : la tentative est reliée par l'`uuid` renvoyé.
      customer_msisdn: params.telephone.startsWith("+") ? params.telephone : `+${params.telephone}`,
    },
    { delaiMs: DELAI_INITIATION_MS, reessayerSiIncertain: false },
  );
  const reponse = appel.reponse;

  if (reponse && reponse.statut >= 200 && reponse.statut < 300) {
    // La réponse n'étant pas documentée, on garde une trace de sa forme réelle. Rien de secret dedans.
    console.log("[elyonpay] paiement direct déclenché, réponse :", masquerCle(JSON.stringify(reponse.corps), process.env.ELYONPAY_API_KEY));
    return { declenche: true, payToken: lireIdentifiantTransaction(reponse.corps) };
  }

  // Aucune réponse après l'envoi, ou erreur du serveur du prestataire : on NE SAIT PAS s'il a déclenché le paiement.
  const incertain = reponse ? reponse.statut >= 500 : !appel.avantEnvoi;
  console.error("[elyonpay] échec d'initiation de paiement direct :", reponse ? masquerCle(`HTTP ${reponse.statut} ${JSON.stringify(reponse.corps)}`, process.env.ELYONPAY_API_KEY) : "aucune réponse");
  if (incertain) return { incertain: true, erreur: MESSAGE_PAIEMENT_INCERTAIN };
  return { erreur: "Impossible de déclencher le paiement pour le moment." };
}

/**
 * Relit une transaction chez ElyonPay (`GET /transactions/{uuid}`). Seule source de vérité sur l'état, le montant et l'opérateur :
 * rien d'autre n'est cru. Erreur serveur, réseau ou clé refusée = « indisponible » (à réessayer), jamais « transaction inconnue ».
 */
export async function verifierTransaction(identifiant: string): Promise<ResultatVerification> {
  if (!elyonpayConfigure()) return { statut: "INCONNU", indisponible: true };
  if (!identifiantTransactionValide(identifiant)) return { statut: "INCONNU", indisponible: false };

  const appel = await appelerBrut("GET", `/transactions/${encodeURIComponent(identifiant)}`);
  const reponse = appel.reponse;
  if (!reponse) return { statut: "INCONNU", indisponible: true };
  if (reponse.statut >= 500) return { statut: "INCONNU", indisponible: true };
  if (reponse.statut === 401 || reponse.statut === 403) {
    // Une clé refusée est un problème de NOTRE configuration, pas une transaction inconnue : signalé et traité comme « indisponible ».
    console.error(`[elyonpay] clé d'API refusée à la relecture d'une transaction (HTTP ${reponse.statut}) : vérifier ELYONPAY_API_KEY`);
    return { statut: "INCONNU", indisponible: true };
  }
  if (reponse.statut >= 400) return { statut: "INCONNU", indisponible: false }; // identifiant inconnu : rien à confirmer
  return { ...analyserReponseTransaction(reponse.corps), indisponible: false };
}

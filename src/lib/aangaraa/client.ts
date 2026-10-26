import "server-only";
import type { ResultatVerification } from "@/lib/paiement/types";
import { analyserReponseStatut, lirePayToken, masquerCle, moyenPaiementDepuisOperateur, urlPaiementAbsolue } from "./utilitaires";

export { moyenPaiementDepuisOperateur };

// Aangaraa Pay (Mobile Money MTN/Orange et carte, choisi le 2026-09-21 à la place de CamPay, lui-même choisi le même jour à la
// place de CinetPay). API REST : l'identifiant de l'application (`app_key`) est passé dans le corps de chaque requête, il n'y a
// ni jeton ni en-tête d'autorisation. Documentation : https://aangaraa-pay.com/integrate-aangaraa-pay
//
// ⚠️ La même `app_key` autorise aussi les RETRAITS (`/aangaraa-pay/withdrawal`) : c'est une clé qui donne accès aux fonds. Jamais
// dans le dépôt, jamais dans une conversation, jamais dans un journal — ce module n'écrit JAMAIS un corps de requête dans les logs.
//
// Variables : AANGARAA_PAY_APP_KEY (obligatoire), AANGARAA_PAY_API_URL (défaut : l'API de production),
// AANGARAA_PAY_URL_PAGE (adresse du site où s'ouvre la page de paiement, quand l'API renvoie un lien relatif).
//
// Rappel CLAUDE.md : le paiement Mobile Money n'est jamais présenté comme « instantané » ou « direct » — les fonds sont reversés
// à l'entreprise avec un délai, dont le nombre de jours n'est pas annoncé tant que le prestataire ne l'a pas confirmé.
const API_PAR_DEFAUT = "https://api-production.aangaraa-pay.com/api/v1";
const PAGE_PAR_DEFAUT = "https://aangaraa-pay.com";
const DELAI_MS = 15_000;
const DELAI_INITIATION_MS = 30_000; // l'invite USSD part avant la réponse : on laisse le temps au prestataire plutôt que de conclure trop vite à un échec

function urlApi(): string {
  return (process.env.AANGARAA_PAY_API_URL || API_PAR_DEFAUT).replace(/\/+$/, "");
}

export function aangaraaConfigure(): boolean {
  return Boolean(process.env.AANGARAA_PAY_APP_KEY);
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
 * Un appel avec une nouvelle tentative sur erreur réseau. Ne consigne jamais le corps envoyé (il contient la clé).
 * `reessayerSiIncertain: false` pour une opération qui DÉPLACE de l'argent (déclencher un paiement) : après un délai dépassé ou une
 * coupure en cours de route, le prestataire a peut-être déjà traité la demande — la rejouer risquerait un second prélèvement. Seule une
 * erreur qui prouve que la requête n'est jamais partie est alors rejouée.
 */
async function appelerBrut(chemin: string, corps: Record<string, unknown>, options: { delaiMs?: number; reessayerSiIncertain?: boolean } = {}): Promise<ResultatAppel> {
  const { delaiMs = DELAI_MS, reessayerSiIncertain = true } = options;
  let avantEnvoi = false;
  for (let essai = 0; essai < 2; essai++) {
    try {
      const reponse = await fetch(`${urlApi()}${chemin}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...corps, app_key: process.env.AANGARAA_PAY_APP_KEY }),
        signal: AbortSignal.timeout(delaiMs),
      });
      let json: unknown = null;
      try {
        json = await reponse.json();
      } catch {
        json = null;
      }
      return { reponse: { statut: reponse.status, corps: json } };
    } catch (erreur) {
      const code = codeErreur(erreur);
      avantEnvoi = code !== undefined && ERREURS_AVANT_ENVOI.has(code);
      console.error(`[aangaraa] erreur réseau sur ${chemin} (essai ${essai + 1}/2, ${avantEnvoi ? "requête non partie" : "résultat incertain"}) :`, erreur instanceof Error ? erreur.message : erreur);
      if (!avantEnvoi && !reessayerSiIncertain) break;
    }
  }
  return { reponse: null, avantEnvoi };
}

async function appeler(chemin: string, corps: Record<string, unknown>): Promise<ReponseApi | null> {
  return (await appelerBrut(chemin, corps)).reponse;
}

export type InitierPaiementParams = {
  /** Référence externe (voir referenceExterne() dans @/lib/paiement/reference) — jamais un identifiant métier. */
  reference: string;
  montant: number; // FCFA, entier
  description: string;
  /** Adresse de notification de CE paiement : Aangaraa Pay la prend à chaque création de lien (contrairement à CamPay). */
  notifyUrl: string;
  /** Page où le client revient après le paiement (réussi ou non : pas de distinction dans notre interface aujourd'hui). */
  returnUrl: string;
};

export type ResultatInitiation = { url: string; erreur?: undefined } | { url?: undefined; erreur: string };

/**
 * Crée un lien de paiement (MTN, Orange ou carte, au choix du client sur la page hébergée) et renvoie son URL. Le lien expire
 * au bout de 4 minutes : chaque clic sur « payer » crée une nouvelle tentative. Ne lève jamais d'exception : une erreur réseau ou
 * API se traduit par { erreur }, jamais un crash de la Server Action appelante.
 */
export async function initierPaiement(params: InitierPaiementParams): Promise<ResultatInitiation> {
  if (!aangaraaConfigure()) return { erreur: "Intégration Aangaraa Pay non configurée pour le moment — utilisez l'encaissement manuel." };

  const reponse = await appeler("/redirect/payment", {
    amount: params.montant,
    description: params.description.slice(0, 255),
    transaction_id: params.reference,
    return_url: params.returnUrl,
    notify_url: params.notifyUrl,
    operator: "ALL",
    devise_id: "XAF",
  });

  const donnees = (reponse?.corps as { data?: { payment_url?: unknown } } | null)?.data;
  const lien = typeof donnees?.payment_url === "string" ? urlPaiementAbsolue(donnees.payment_url, process.env.AANGARAA_PAY_URL_PAGE || PAGE_PAR_DEFAUT) : null;
  if ((reponse?.statut === 200 || reponse?.statut === 201) && lien) return { url: lien };

  // Le corps de la RÉPONSE (message d'erreur) est consigné, jamais celui de la requête — et sa copie éventuelle de la clé est masquée.
  console.error("[aangaraa] échec d'initiation de paiement :", reponse ? masquerCle(`HTTP ${reponse.statut} ${JSON.stringify(reponse.corps)}`, process.env.AANGARAA_PAY_APP_KEY) : "aucune réponse");
  return { erreur: "Impossible de générer le lien de paiement pour le moment." };
}

export type InitierPaiementDirectParams = InitierPaiementParams & {
  /** Format international obligatoire (+237…) — voir telephoneInternational() dans @/lib/paiement/telephone. */
  telephone: string;
  /**
   * Contrairement à `/redirect/payment` (« ALL » laisse le client choisir sur la page hébergée), il n'y a ici aucune
   * page où choisir : Aangaraa Pay doit savoir à l'avance vers quel opérateur pousser l'invite USSD. Jamais deviné
   * depuis le préfixe du numéro (risque d'erreur avec de l'argent réel) — le client choisit lui-même dans notre
   * interface. Leur propre exemple de documentation pour cet endpoint utilise "Orange_Cameroon", jamais "ALL".
   */
  operateur: "MTN_Cameroon" | "Orange_Cameroon";
};

/** Montré au client quand on ne sait pas si le prestataire a traité la demande : jamais « échec » (il a peut-être déjà été débité). */
export const MESSAGE_PAIEMENT_INCERTAIN =
  "Nous n'avons pas pu confirmer votre paiement. Si une demande est arrivée sur votre téléphone, ne payez pas une seconde fois : contactez-nous, nous vérifions et nous vous répondons rapidement.";

export type ResultatInitiationDirecte =
  | { declenche: true; payToken: string | null; erreur?: undefined; incertain?: undefined }
  | { declenche?: undefined; payToken?: undefined; erreur: string; incertain?: true };

/**
 * Déclenche un paiement SANS redirection (`/no_redirect/payment`) : Aangaraa Pay envoie une invite USSD directement au
 * téléphone du client, qui valide sur son appareil — jamais de page hébergée à ouvrir. Correction du 2026-09-22 : la
 * première intégration utilisait `/redirect/payment` partout, alors que ce produit-ci (paiement encaissé sans quitter
 * notre interface) appelle celui-ci.
 *
 * Le format de la RÉPONSE n'est pas documenté par Aangaraa Pay (schéma OpenAPI vide pour cet endpoint) — on tente
 * d'en extraire un `payToken` (même format que celui d'une notification, voir lirePayToken()) pour une relecture
 * ACTIVE du statut : constaté en réel le 2026-09-22 qu'Aangaraa Pay n'appelle `notify_url` qu'une fois, immédiatement
 * (transaction encore PENDING) — jamais une seconde fois quand le client valide réellement sur son téléphone. Sans ce
 * payToken, aucune confirmation n'est possible : voir relireEtConfirmerAbonnement() dans @/lib/paiement/confirmation.
 */
export async function initierPaiementDirect(params: InitierPaiementDirectParams): Promise<ResultatInitiationDirecte> {
  if (!aangaraaConfigure()) return { erreur: "Intégration Aangaraa Pay non configurée pour le moment — utilisez l'encaissement manuel." };

  const appel = await appelerBrut("/no_redirect/payment", {
    // ⚠️ `telephoneInternational()` produit "+237…" (format international standard), mais /no_redirect/payment veut le
    // numéro SANS le "+" (ex. "237690111222") — constaté en réel le 2026-09-23. On ne touche pas
    // telephoneInternational() (réutilisable ailleurs avec le "+"), on retire juste le signe ici, au point d'entrée
    // de cet appel précis.
    phone_number: params.telephone.replace(/^\+/, ""),
    // ⚠️ Contrairement à /redirect/payment (amount numérique), le schéma NoRedirectPaymentRequest exige une CHAÎNE
    // pour amount (vérifié en réel le 2026-09-22 : "Input should be a valid string" sur un nombre JSON).
    amount: String(params.montant),
    description: params.description.slice(0, 255),
    transaction_id: params.reference,
    return_url: params.returnUrl,
    notify_url: params.notifyUrl,
    operator: params.operateur,
    devise_id: "XAF",
  }, { delaiMs: DELAI_INITIATION_MS, reessayerSiIncertain: false });
  const reponse = appel.reponse;

  if (reponse && (reponse.statut === 200 || reponse.statut === 201)) {
    // Journalisé une fois pour de bon (diagnostic du 2026-09-22) : la réponse n'étant pas documentée, on garde une
    // trace de sa forme réelle. Rien de secret dedans (contrairement au corps envoyé) — la clé n'y figure jamais.
    console.log("[aangaraa] paiement direct déclenché, réponse :", JSON.stringify(reponse.corps));
    const donnees = (reponse.corps as { data?: Record<string, unknown> } | null)?.data;
    const payToken = lirePayToken(donnees) ?? lirePayToken(reponse.corps as Record<string, unknown>);
    return { declenche: true, payToken };
  }

  // Aucune réponse après l'envoi, ou erreur du serveur du prestataire : on NE SAIT PAS s'il a déclenché le paiement.
  const incertain = reponse ? reponse.statut >= 500 : !appel.avantEnvoi;
  console.error(
    "[aangaraa] échec d'initiation de paiement direct :",
    reponse ? masquerCle(`HTTP ${reponse.statut} ${JSON.stringify(reponse.corps)}`, process.env.AANGARAA_PAY_APP_KEY) : "aucune réponse"
  );
  if (incertain) return { incertain: true, erreur: MESSAGE_PAIEMENT_INCERTAIN };
  return { erreur: "Impossible de déclencher le paiement pour le moment." };
}

/**
 * Relit une transaction directement chez Aangaraa Pay, par son `payToken` (le seul identifiant que son API accepte pour lire un
 * statut — il arrive avec la notification). Seule source de vérité sur le statut, le montant et NOTRE référence : le contenu d'une
 * notification n'est jamais cru, il ne dit que QUOI relire.
 */
export async function verifierTransaction(payToken: string): Promise<ResultatVerification> {
  if (!aangaraaConfigure()) return { statut: "INCONNU", indisponible: true };

  const reponse = await appeler("/aangaraa_check_status", { payToken });
  if (!reponse) return { statut: "INCONNU", indisponible: true };
  if (reponse.statut >= 500) return { statut: "INCONNU", indisponible: true };
  if (reponse.statut >= 400) {
    // Une clé refusée (« App Key Not Found », 401/403) est un problème de NOTRE configuration, pas une transaction inconnue :
    // signalé et traité comme « indisponible » pour que le prestataire rappelle une fois la clé corrigée, au lieu de perdre le paiement.
    const message = String((reponse.corps as { message?: unknown } | null)?.message ?? "");
    if (reponse.statut === 401 || reponse.statut === 403 || /app.?key/i.test(message)) {
      console.error(`[aangaraa] clé d'application refusée à la relecture d'un statut (HTTP ${reponse.statut}) : vérifier AANGARAA_PAY_APP_KEY`);
      return { statut: "INCONNU", indisponible: true };
    }
    return { statut: "INCONNU", indisponible: false }; // jeton inconnu : rien à confirmer
  }
  return { ...analyserReponseStatut(reponse.corps), indisponible: false };
}

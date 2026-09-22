import "server-only";
import type { ResultatVerification } from "@/lib/paiement/types";
import { analyserReponseStatut, masquerCle, moyenPaiementDepuisOperateur, urlPaiementAbsolue } from "./utilitaires";

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

function urlApi(): string {
  return (process.env.AANGARAA_PAY_API_URL || API_PAR_DEFAUT).replace(/\/+$/, "");
}

export function aangaraaConfigure(): boolean {
  return Boolean(process.env.AANGARAA_PAY_APP_KEY);
}

type ReponseApi = { statut: number; corps: unknown };

/** Un appel avec une nouvelle tentative sur erreur réseau. `null` = aucune réponse. Ne consigne jamais le corps envoyé (il contient la clé). */
async function appeler(chemin: string, corps: Record<string, unknown>): Promise<ReponseApi | null> {
  for (let essai = 0; essai < 2; essai++) {
    try {
      const reponse = await fetch(`${urlApi()}${chemin}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...corps, app_key: process.env.AANGARAA_PAY_APP_KEY }),
        signal: AbortSignal.timeout(DELAI_MS),
      });
      let json: unknown = null;
      try {
        json = await reponse.json();
      } catch {
        json = null;
      }
      return { statut: reponse.status, corps: json };
    } catch (erreur) {
      if (essai === 1) console.error("[aangaraa] erreur réseau :", erreur instanceof Error ? erreur.message : erreur);
    }
  }
  return null;
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

export type ResultatInitiationDirecte = { declenche: true; erreur?: undefined } | { declenche?: undefined; erreur: string };

/**
 * Déclenche un paiement SANS redirection (`/no_redirect/payment`) : Aangaraa Pay envoie une invite USSD directement au
 * téléphone du client, qui valide sur son appareil — jamais de page hébergée à ouvrir. Correction du 2026-09-22 : la
 * première intégration utilisait `/redirect/payment` partout, alors que ce produit-ci (paiement encaissé sans quitter
 * notre interface) appelle celui-ci.
 *
 * Le format de la RÉPONSE n'est pas documenté par Aangaraa Pay (schéma OpenAPI vide pour cet endpoint, vérifié le
 * 2026-09-22) : on ne s'y fie donc PAS pour confirmer quoi que ce soit — seul un HTTP 200/201 dit que la demande a bien
 * été transmise au client, exactement comme `initierPaiement()` ne fait que renvoyer un lien. La confirmation réelle
 * reste exclusivement la notification + verifierTransaction(), comme pour le flux avec redirection.
 */
export async function initierPaiementDirect(params: InitierPaiementDirectParams): Promise<ResultatInitiationDirecte> {
  if (!aangaraaConfigure()) return { erreur: "Intégration Aangaraa Pay non configurée pour le moment — utilisez l'encaissement manuel." };

  const reponse = await appeler("/no_redirect/payment", {
    phone_number: params.telephone,
    // ⚠️ Contrairement à /redirect/payment (amount numérique), le schéma NoRedirectPaymentRequest exige une CHAÎNE
    // pour amount (vérifié en réel le 2026-09-22 : "Input should be a valid string" sur un nombre JSON).
    amount: String(params.montant),
    description: params.description.slice(0, 255),
    transaction_id: params.reference,
    return_url: params.returnUrl,
    notify_url: params.notifyUrl,
    operator: params.operateur,
    devise_id: "XAF",
  });

  if (reponse && (reponse.statut === 200 || reponse.statut === 201)) return { declenche: true };

  console.error(
    "[aangaraa] échec d'initiation de paiement direct :",
    reponse ? masquerCle(`HTTP ${reponse.statut} ${JSON.stringify(reponse.corps)}`, process.env.AANGARAA_PAY_APP_KEY) : "aucune réponse"
  );
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

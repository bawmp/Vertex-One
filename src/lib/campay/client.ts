import "server-only";
import { mapperStatut, moyenPaiementDepuisOperateur, type StatutPaiement } from "./utilitaires";

export { moyenPaiementDepuisOperateur };

// CamPay (Mobile Money MTN/Orange, choisi le 2026-09-21 à la place de CinetPay, dont l'authentification restait bloquée).
// API REST simple : jeton `Authorization: Token …`, lien de paiement hébergé par CamPay (redirection, comme avant),
// statut d'une transaction relu serveur-à-serveur.
//
// Environnement : CAMPAY_ENV=production pour l'API réelle, sinon bac à sable (demo.campay.net, montant plafonné à 25 FCFA).
// Identifiants : CAMPAY_TOKEN (jeton permanent, préféré) ou CAMPAY_USERNAME + CAMPAY_PASSWORD (jeton d'une heure, renouvelé
// ici). CAMPAY_WEBHOOK_KEY sert à contrôler la signature des notifications.
//
// Rappel CLAUDE.md : le paiement Mobile Money n'est jamais présenté comme « instantané » ou « direct » — les fonds sont
// reversés à l'entreprise par le prestataire, avec un délai.
const BASES = { demo: "https://demo.campay.net/api", production: "https://www.campay.net/api" };
const DELAI_MS = 15_000;

function urlApi(): string {
  return process.env.CAMPAY_ENV === "production" ? BASES.production : BASES.demo;
}

export function campayConfigure(): boolean {
  return Boolean(process.env.CAMPAY_TOKEN || (process.env.CAMPAY_USERNAME && process.env.CAMPAY_PASSWORD));
}

let jetonTemporaire: { valeur: string; expireLe: number } | null = null;

async function jetonAutorisation(): Promise<string | null> {
  if (process.env.CAMPAY_TOKEN) return process.env.CAMPAY_TOKEN;
  if (jetonTemporaire && jetonTemporaire.expireLe > Date.now() + 60_000) return jetonTemporaire.valeur;
  const reponse = await fetch(`${urlApi()}/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: process.env.CAMPAY_USERNAME, password: process.env.CAMPAY_PASSWORD }),
    signal: AbortSignal.timeout(DELAI_MS),
  });
  if (!reponse.ok) return null;
  const corps = (await reponse.json()) as { token?: string; expires_in?: number };
  if (!corps.token) return null;
  jetonTemporaire = { valeur: corps.token, expireLe: Date.now() + (corps.expires_in ?? 3600) * 1000 };
  return corps.token;
}

type ReponseApi = { statut: number; corps: Record<string, unknown> | null };

/** Un appel authentifié, avec une nouvelle tentative sur erreur réseau (le bac à sable a répondu par des délais dépassés isolés). */
async function appeler(methode: "GET" | "POST", chemin: string, corps?: Record<string, unknown>): Promise<ReponseApi | null> {
  const jeton = await jetonAutorisation();
  if (!jeton) return null;
  for (let essai = 0; essai < 2; essai++) {
    try {
      const reponse = await fetch(`${urlApi()}${chemin}`, {
        method: methode,
        headers: { "Content-Type": "application/json", Authorization: `Token ${jeton}` },
        body: corps ? JSON.stringify(corps) : undefined,
        signal: AbortSignal.timeout(DELAI_MS),
      });
      let json: Record<string, unknown> | null = null;
      try {
        json = (await reponse.json()) as Record<string, unknown>;
      } catch {
        json = null;
      }
      return { statut: reponse.status, corps: json };
    } catch (erreur) {
      if (essai === 1) console.error("[campay] erreur réseau :", erreur instanceof Error ? erreur.message : erreur);
    }
  }
  return null;
}

export type InitierPaiementParams = {
  /** Référence externe (voir referenceExterne() dans ./utilitaires) — jamais un identifiant métier. */
  reference: string;
  montant: number; // FCFA, entier
  description: string;
  /** Page où CamPay renvoie le client après le paiement (réussi ou non : pas de distinction dans notre interface aujourd'hui). */
  returnUrl: string;
};

export type ResultatInitiation = { url: string; erreur?: undefined } | { url?: undefined; erreur: string };

/**
 * Crée un lien de paiement CamPay (MTN, Orange ou carte, au choix du client sur la page hébergée) et renvoie son URL. Ne lève
 * jamais d'exception : une erreur réseau ou API se traduit par { erreur }, jamais un crash de la Server Action appelante.
 * L'adresse de notification n'est pas passée ici : CamPay n'en connaît qu'une par application, réglée dans son tableau de bord
 * (`/api/paiements/campay/notify`).
 */
export async function initierPaiement(params: InitierPaiementParams): Promise<ResultatInitiation> {
  if (!campayConfigure()) return { erreur: "Intégration CamPay non configurée pour le moment — utilisez l'encaissement manuel." };

  const reponse = await appeler("POST", "/get_payment_link/", {
    amount: String(params.montant),
    currency: "XAF",
    description: params.description.slice(0, 255),
    external_reference: params.reference,
    redirect_url: params.returnUrl,
    failure_redirect_url: params.returnUrl,
  });
  const lien = reponse?.corps?.link;
  if (reponse?.statut === 200 && typeof lien === "string") return { url: lien };

  console.error("[campay] échec d'initiation de paiement :", reponse ? `HTTP ${reponse.statut} ${JSON.stringify(reponse.corps)}` : "aucune réponse");
  return { erreur: "Impossible de générer le lien de paiement pour le moment." };
}

export type ResultatVerification = {
  statut: StatutPaiement;
  /** Le prestataire n'a pas pu être interrogé (réseau, jeton) : à réessayer, à ne pas confondre avec « transaction inconnue ». */
  indisponible: boolean;
  referenceExterne?: string;
  montant?: number;
  operateur?: string;
};

/**
 * Relit une transaction directement auprès de CamPay, par SA référence (celle de la notification). Seule source de vérité sur
 * le statut, le montant et la référence externe : le contenu d'une notification n'est jamais cru, il ne dit que QUOI vérifier.
 */
export async function verifierTransaction(referenceCampay: string): Promise<ResultatVerification> {
  if (!campayConfigure()) return { statut: "INCONNU", indisponible: true };
  // La référence d'une notification vient d'un appel anonyme : seulement un UUID, jamais un fragment d'URL arbitraire.
  if (!/^[0-9a-f-]{36}$/i.test(referenceCampay)) return { statut: "INCONNU", indisponible: false };

  const reponse = await appeler("GET", `/transaction/${referenceCampay}/`);
  if (!reponse) return { statut: "INCONNU", indisponible: true };
  if (reponse.statut === 404) return { statut: "INCONNU", indisponible: false };
  if (reponse.statut !== 200 || !reponse.corps) return { statut: "INCONNU", indisponible: true };

  const c = reponse.corps;
  const montant = Number(c.amount);
  return {
    statut: mapperStatut(typeof c.status === "string" ? c.status : undefined),
    indisponible: false,
    referenceExterne: typeof c.external_reference === "string" ? c.external_reference : undefined,
    montant: Number.isFinite(montant) ? Math.round(montant) : undefined,
    operateur: typeof c.operator === "string" ? c.operator : undefined,
  };
}

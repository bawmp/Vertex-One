import { createHmac } from "node:crypto";

/**
 * Connexion de l'assistant WhatsApp Kyria (hébergé par Vertex Technology) au Vertex One d'une entreprise cliente.
 *
 * Principe (aucune table, aucune clé dans une adresse web) : l'Administrateur arrive depuis son portail Kyria avec un « état » aléatoire
 * (fourni par Kyria, à usage unique de son côté) et l'adresse de retour. Il autorise ; Vertex One crée une clé d'API dédiée, la
 * TRANSMET directement au serveur de Kyria (appel de serveur à serveur signé par un secret partagé, jamais par le navigateur) puis
 * renvoie le navigateur vers le portail. Si la transmission échoue, la clé fraîchement créée est révoquée aussitôt : jamais de clé
 * orpheline.
 */
export const NOM_CLE_KYRIA = "Kyria WhatsApp";

/** L'état de Kyria : 32 octets aléatoires en base64url (43 caractères). */
export const FORME_ETAT = /^[A-Za-z0-9_-]{43}$/;

export function kyriaConfigure(): boolean {
  return Boolean(process.env.KYRIA_CONNEXION_URL && process.env.KYRIA_CONNEXION_SECRET && process.env.KYRIA_PORTAIL_URL);
}

const estLocal = (u: URL) => u.hostname === "localhost" || u.hostname === "127.0.0.1";

/**
 * L'adresse où renvoyer le navigateur : UNIQUEMENT le portail Kyria déclaré (même origine que KYRIA_PORTAIL_URL), en https sauf en local.
 * Sans cela, un lien piégé pourrait envoyer l'Administrateur ailleurs (redirection ouverte). Renvoie l'adresse nettoyée, ou null.
 */
export function retourAutorise(retour: string): string | null {
  try {
    const url = new URL(retour);
    const base = new URL(process.env.KYRIA_PORTAIL_URL ?? "");
    if (url.origin !== base.origin) return null;
    if (url.protocol !== "https:" && !estLocal(url)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function signerCorps(corps: string, secret: string): string {
  return createHmac("sha256", secret).update(corps).digest("hex");
}

/** L'adresse de Kyria qui reçoit la clé : https obligatoire (sauf local), la clé voyage dans le corps. */
function adresseKyria(): string | null {
  try {
    const url = new URL(process.env.KYRIA_CONNEXION_URL ?? "");
    return url.protocol === "https:" || estLocal(url) ? url.toString() : null;
  } catch {
    return null;
  }
}

export type ResultatTransmission = { ok: true } | { ok: false; erreur: string };

/** Envoie la clé au serveur de Kyria, signée. Jamais d'exception ; l'erreur ne contient jamais la clé. */
export async function transmettreCleAKyria(params: { etat: string; cle: string; entreprise: string }): Promise<ResultatTransmission> {
  const adresse = adresseKyria();
  const secret = process.env.KYRIA_CONNEXION_SECRET;
  if (!adresse || !secret) return { ok: false, erreur: "Liaison Kyria non configurée." };

  const corps = JSON.stringify({ etat: params.etat, cle: params.cle, entreprise: params.entreprise, emisLe: Date.now() });
  try {
    const reponse = await fetch(adresse, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vertexone-Signature": `sha256=${signerCorps(corps, secret)}` },
      body: corps,
      signal: AbortSignal.timeout(10_000),
    });
    return reponse.ok ? { ok: true } : { ok: false, erreur: `Kyria a répondu HTTP ${reponse.status}.` };
  } catch {
    return { ok: false, erreur: "Kyria est injoignable." };
  }
}

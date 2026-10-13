import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Secrets de la liaison Facebook (2026-10-13). Aucune clé de plus à configurer : toutes les clés de chiffrement et de
 * signature sont DÉRIVÉES du secret de l'application Meta (`META_APP_SECRET`, déjà exigé pour vérifier les webhooks),
 * avec un « contexte » distinct par usage — une clé servant au jeton d'une page ne peut jamais déchiffrer le cookie
 * temporaire ni signer un état OAuth. Faire tourner le secret de l'application invalide les jetons stockés : les pages
 * sont alors à reconnecter, ce qui est le comportement voulu après un changement de secret.
 */
export function secretApplicationMeta(): string | null {
  const secret = process.env.META_APP_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}

function cle(contexte: string): Buffer {
  const secret = secretApplicationMeta();
  if (!secret) throw new Error("META_APP_SECRET n'est pas configuré.");
  return Buffer.from(hkdfSync("sha256", secret, "vertexone-facebook", contexte, 32));
}

/** AES-256-GCM : `v1.<iv>.<étiquette>.<données>` en base64url. Chaque chiffrement a son propre IV aléatoire. */
export function chiffrer(texte: string, contexte: string): string {
  const iv = randomBytes(12);
  const chiffre = createCipheriv("aes-256-gcm", cle(contexte), iv);
  const donnees = Buffer.concat([chiffre.update(texte, "utf8"), chiffre.final()]);
  return ["v1", iv.toString("base64url"), chiffre.getAuthTag().toString("base64url"), donnees.toString("base64url")].join(".");
}

/** null si le texte est altéré, mal formé ou chiffré avec une autre clé : jamais d'exception à interpréter par l'appelant. */
export function dechiffrer(texte: string, contexte: string): string | null {
  const [version, iv, etiquette, donnees] = texte.split(".");
  if (version !== "v1" || !iv || !etiquette || !donnees) return null;
  try {
    const dechiffre = createDecipheriv("aes-256-gcm", cle(contexte), Buffer.from(iv, "base64url"));
    dechiffre.setAuthTag(Buffer.from(etiquette, "base64url"));
    return Buffer.concat([dechiffre.update(Buffer.from(donnees, "base64url")), dechiffre.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export const CONTEXTE_JETON_PAGE = "jeton-page";
export const CONTEXTE_COOKIE_PAGES = "cookie-pages";

const DUREE_ETAT_MS = 10 * 60 * 1000;

/**
 * « state » OAuth : lie le retour de Facebook à CET utilisateur connecté et à CE navigateur (le nonce est aussi posé
 * dans un cookie httpOnly). Signé (HMAC-SHA256) et daté : un état forgé, rejoué plus tard ou venu d'un autre
 * navigateur est refusé (CSRF).
 */
export function creerEtat(utilisateurId: string, nonce: string, maintenant: number = Date.now()): string {
  const corps = `${utilisateurId}.${nonce}.${maintenant + DUREE_ETAT_MS}`;
  const signature = createHmac("sha256", cle("etat-oauth")).update(corps).digest("base64url");
  return `${Buffer.from(corps).toString("base64url")}.${signature}`;
}

export function verifierEtat(etat: string, maintenant: number = Date.now()): { utilisateurId: string; nonce: string } | null {
  const [corpsEncode, signature] = etat.split(".");
  if (!corpsEncode || !signature) return null;
  const corps = Buffer.from(corpsEncode, "base64url").toString("utf8");
  let attendue: Buffer;
  try {
    attendue = createHmac("sha256", cle("etat-oauth")).update(corps).digest();
  } catch {
    return null;
  }
  const recue = Buffer.from(signature, "base64url");
  if (recue.length !== attendue.length || !timingSafeEqual(recue, attendue)) return null;
  const [utilisateurId, nonce, expiration] = corps.split(".");
  if (!utilisateurId || !nonce || Number(expiration) < maintenant) return null;
  return { utilisateurId, nonce };
}

export function nouveauNonce(): string {
  return randomBytes(16).toString("base64url");
}

/** Vérifie la signature `X-Hub-Signature-256` d'un webhook Meta (HMAC-SHA256 du corps brut avec le secret de l'application). */
export function signatureWebhookValide(corpsBrut: string, enTete: string | null): boolean {
  const secret = secretApplicationMeta();
  if (!secret || !enTete?.startsWith("sha256=")) return false;
  const recue = Buffer.from(enTete.slice("sha256=".length), "hex");
  const attendue = createHmac("sha256", secret).update(corpsBrut).digest();
  return recue.length === attendue.length && timingSafeEqual(recue, attendue);
}

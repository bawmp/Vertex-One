import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Chiffrement des identifiants qu'une entreprise confie à Vertex One pour joindre son site (clés WooCommerce…), 2026-11-12.
 * AES-256-GCM, clé DÉRIVÉE du secret de l'application (`BETTER_AUTH_SECRET`, toujours configuré) avec un contexte propre à cet usage :
 * aucune variable d'environnement de plus à gérer. Changer ce secret rend les identifiants illisibles : les boutiques sont alors à
 * reconnecter (message clair à l'écran), jamais une fuite. Un identifiant n'est JAMAIS conservé en clair en base ni renvoyé au navigateur.
 */
const CONTEXTE = "vertexone-boutique-v1";

function cle(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 16) throw new Error("BETTER_AUTH_SECRET n'est pas configuré : impossible de protéger les identifiants du site.");
  return Buffer.from(hkdfSync("sha256", secret, "vertexone", CONTEXTE, 32));
}

/** `v1.<iv>.<étiquette>.<données>` en base64url ; chaque chiffrement a son propre IV aléatoire. */
export function chiffrerConfig(config: Record<string, string>): string {
  const iv = randomBytes(12);
  const chiffre = createCipheriv("aes-256-gcm", cle(), iv);
  const donnees = Buffer.concat([chiffre.update(JSON.stringify(config), "utf8"), chiffre.final()]);
  return ["v1", iv.toString("base64url"), chiffre.getAuthTag().toString("base64url"), donnees.toString("base64url")].join(".");
}

/** null si le texte est altéré, mal formé ou chiffré avec un autre secret : jamais d'exception à interpréter par l'appelant. */
export function dechiffrerConfig(texte: string | null): Record<string, string> | null {
  if (!texte) return null;
  const [version, iv, etiquette, donnees] = texte.split(".");
  if (version !== "v1" || !iv || !etiquette || !donnees) return null;
  try {
    const dechiffre = createDecipheriv("aes-256-gcm", cle(), Buffer.from(iv, "base64url"));
    dechiffre.setAuthTag(Buffer.from(etiquette, "base64url"));
    const clair = Buffer.concat([dechiffre.update(Buffer.from(donnees, "base64url")), dechiffre.final()]).toString("utf8");
    const objet = JSON.parse(clair) as unknown;
    return objet && typeof objet === "object" ? (objet as Record<string, string>) : null;
  } catch {
    return null;
  }
}

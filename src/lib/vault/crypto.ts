import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Aucun pattern de chiffrement au repos n'existait dans ce projet avant One
// Vault (confirmé par recherche) — les identifiants tiers (Migadu/CinetPay/
// Resend/Anthropic) sont de simples variables d'environnement, et Better-
// Auth hache les mots de passe de connexion en scrypt, à sens unique, donc
// inutilisable pour un coffre qui doit pouvoir redonner le secret en clair.
//
// Chiffrement côté serveur (AES-256-GCM, clé maîtresse unique), pas un
// chiffrement de bout en bout — décision validée avec l'utilisateur.
// Limite assumée : quelqu'un avec un accès complet au serveur ET à la base
// pourrait déchiffrer, cohérent avec le niveau de confiance déjà accordé
// aux autres identifiants du produit.
//
// Contrairement à Kyria/Resend/CinetPay (dégradation silencieuse tant
// qu'une clé n'est pas configurée, parce que la fonctionnalité est
// simplement indisponible), ce module est fail-closed : sans clé valide,
// aucun secret ne doit jamais être écrit en clair — voir garde() dans
// src/lib/actions/one-vault.ts.
//
// Pas de "server-only" ici (contrairement à one-vault.ts/session.ts) :
// logique pure sans dépendance à une requête/session, même statut que
// src/lib/groupe/logique.ts ou src/lib/abonnement/etat.ts — testable
// directement sans base de données ni contexte HTTP.
const VAULT_ENCRYPTION_KEY = process.env.VAULT_ENCRYPTION_KEY;
const TAILLE_CLE_OCTETS = 32; // AES-256
const TAILLE_IV_OCTETS = 12; // recommandation AES-GCM
const TAILLE_AUTH_TAG_OCTETS = 16;

function cleValide(): Buffer | null {
  if (!VAULT_ENCRYPTION_KEY) return null;
  try {
    const cle = Buffer.from(VAULT_ENCRYPTION_KEY, "base64");
    return cle.length === TAILLE_CLE_OCTETS ? cle : null;
  } catch {
    return null;
  }
}

export function vaultConfigure(): boolean {
  return cleValide() !== null;
}

/** Renvoie base64(iv + authTag + ciphertext) — une seule chaîne à stocker. */
export function chiffrer(texteClair: string): string {
  const cle = cleValide();
  if (!cle) throw new Error("VAULT_ENCRYPTION_KEY absente ou invalide — impossible de chiffrer.");

  const iv = randomBytes(TAILLE_IV_OCTETS);
  const chiffreur = createCipheriv("aes-256-gcm", cle, iv);
  const ciphertext = Buffer.concat([chiffreur.update(texteClair, "utf8"), chiffreur.final()]);
  const authTag = chiffreur.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/**
 * L'échec de vérification de l'authTag (clé changée, donnée corrompue)
 * lève une exception plutôt que de renvoyer un texte partiellement ou
 * silencieusement faux — un déchiffrement raté doit être visible.
 */
export function dechiffrer(blob: string): string {
  const cle = cleValide();
  if (!cle) throw new Error("VAULT_ENCRYPTION_KEY absente ou invalide — impossible de déchiffrer.");

  const donnees = Buffer.from(blob, "base64");
  const iv = donnees.subarray(0, TAILLE_IV_OCTETS);
  const authTag = donnees.subarray(TAILLE_IV_OCTETS, TAILLE_IV_OCTETS + TAILLE_AUTH_TAG_OCTETS);
  const ciphertext = donnees.subarray(TAILLE_IV_OCTETS + TAILLE_AUTH_TAG_OCTETS);

  const dechiffreur = createDecipheriv("aes-256-gcm", cle, iv);
  dechiffreur.setAuthTag(authTag);
  return Buffer.concat([dechiffreur.update(ciphertext), dechiffreur.final()]).toString("utf8");
}

export type ContenuSecret = { motDePasse: string; notes: string };

export function chiffrerContenuSecret(contenu: ContenuSecret): string {
  return chiffrer(JSON.stringify(contenu));
}

export function dechiffrerContenuSecret(blob: string): ContenuSecret {
  return JSON.parse(dechiffrer(blob)) as ContenuSecret;
}

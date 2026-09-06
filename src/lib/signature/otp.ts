import { hashPassword, verifyPassword } from "better-auth/crypto";

/**
 * Code de vérification à usage unique — le deuxième canal qui authentifie
 * réellement l'identité du signataire (docs/palier-4-*, section 2). Haché
 * avec le même algorithme (scrypt) que les mots de passe du produit, jamais
 * stocké en clair — un OTP compromis en base ne doit pas être rejouable
 * plus qu'un mot de passe ne le serait.
 */
export function genererCodeVerification(): string {
  // 6 chiffres — assez court pour être saisi facilement depuis un SMS/WhatsApp,
  // assez long combiné à l'expiration courte du jetonAcces pour résister au
  // brute-force dans la fenêtre de validité.
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function hacherCodeVerification(code: string): Promise<string> {
  return hashPassword(code);
}

export async function verifierCodeVerification(code: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  return verifyPassword({ password: code, hash });
}

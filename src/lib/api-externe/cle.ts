import { createHash, randomBytes } from "node:crypto";

/**
 * Clé d'API d'une entreprise : `vo_` suivi de 32 octets aléatoires (256 bits) encodés en base64url, soit 46 caractères.
 * La clé en clair n'est montrée qu'une fois ; on ne conserve que son empreinte SHA-256. Pour un secret de cette
 * entropie un hachage rapide suffit (aucune attaque par dictionnaire n'est possible), et il permet de retrouver la clé
 * par simple égalité en base.
 */
const FORME_CLE = /^vo_[A-Za-z0-9_-]{43}$/;

export function empreinteCle(cle: string): string {
  return createHash("sha256").update(cle).digest("hex");
}

export function genererCle(): { cle: string; prefixe: string; empreinte: string } {
  const cle = `vo_${randomBytes(32).toString("base64url")}`;
  return { cle, prefixe: cle.slice(0, 10), empreinte: empreinteCle(cle) };
}

export function formeCleValide(cle: string): boolean {
  return FORME_CLE.test(cle);
}

/** Extrait la clé d'un en-tête `Authorization: Bearer <clé>` ; null si absent ou mal formé. */
export function lireCleDepuisEnTete(valeur: string | null): string | null {
  const correspondance = /^Bearer\s+(\S+)$/i.exec(valeur?.trim() ?? "");
  return correspondance ? correspondance[1] : null;
}

import { createHash } from "node:crypto";

/**
 * SHA-256 du PDF au moment de l'envoi (docs/palier-4-*, section 2) — preuve
 * qu'il n'a pas été modifié depuis. Calculée une seule fois à la création de
 * la DemandeSignature, jamais recalculée : une différence à la vérification
 * prouverait une altération, pas un bug de calcul.
 */
export function calculerEmpreinteDocument(contenu: Buffer): string {
  return createHash("sha256").update(contenu).digest("hex");
}

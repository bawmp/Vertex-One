import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Logique pure du module CamPay — isolée de src/lib/campay/client.ts (qui importe "server-only") pour rester testable
 * directement en Vitest, même patron que src/lib/abonnement/etat.ts.
 */

export type StatutPaiement = "ACCEPTED" | "REFUSED" | "PENDING" | "INCONNU";

/** CamPay ne connaît que trois statuts : PENDING, SUCCESSFUL, FAILED. Tout autre texte est traité comme inconnu, jamais comme un succès. */
export function mapperStatut(statut: string | undefined): StatutPaiement {
  if (statut === "SUCCESSFUL") return "ACCEPTED";
  if (statut === "FAILED") return "REFUSED";
  if (statut === "PENDING") return "PENDING";
  return "INCONNU";
}

/** CamPay renvoie l'opérateur en toutes lettres (« MTN », « ORANGE ») — mappé sur l'enum moyenPaiement existant, jamais une valeur ad hoc. */
export function moyenPaiementDepuisOperateur(operateur: string | undefined): "orange_money" | "mtn_momo" {
  return /orange/i.test(operateur ?? "") ? "orange_money" : "mtn_momo";
}

export type NatureTentative = "FACTURE" | "ABONNEMENT";

const PREFIXES: Record<NatureTentative, string> = { FACTURE: "fac_", ABONNEMENT: "abo_" };

/**
 * Référence externe transmise à CamPay = préfixe + id de la ligne de tentative (cuid2). Le préfixe dit au webhook, unique
 * pour toute l'application côté CamPay, dans quelle table chercher (facture d'un client, ou abonnement à Vertex One). Jamais
 * un identifiant métier (facture, entreprise) : seul l'id de la tentative, sans signification hors de notre base.
 */
export function referenceExterne(nature: NatureTentative, idTentative: string): string {
  return PREFIXES[nature] + idTentative;
}

export function lireReferenceExterne(reference: string | undefined | null): { nature: NatureTentative; id: string } | null {
  const r = reference ?? "";
  for (const nature of Object.keys(PREFIXES) as NatureTentative[]) {
    if (r.startsWith(PREFIXES[nature]) && r.length > PREFIXES[nature].length) return { nature, id: r.slice(PREFIXES[nature].length) };
  }
  return null;
}

/**
 * Vérifie la signature d'une notification CamPay : un JWT HS256 signé avec la clé webhook de l'application (constaté sur
 * une vraie transaction du bac à sable). Comparaison en temps constant ; expiration (`exp`) respectée quand elle est présente.
 * Ne fait AUCUNE confiance au contenu du JWT — sert seulement à écarter les appels qui ne viennent manifestement pas de CamPay.
 */
export function signatureValide(signature: string | undefined | null, cleWebhook: string | undefined, maintenant: Date = new Date()): boolean {
  if (!signature || !cleWebhook) return false;
  const morceaux = signature.split(".");
  if (morceaux.length !== 3) return false;
  const [entete, charge, recue] = morceaux;
  try {
    if (JSON.parse(Buffer.from(entete, "base64url").toString()).alg !== "HS256") return false;
    const attendue = createHmac("sha256", cleWebhook).update(`${entete}.${charge}`).digest();
    const fournie = Buffer.from(recue, "base64url");
    if (fournie.length !== attendue.length || !timingSafeEqual(fournie, attendue)) return false;
    const exp = JSON.parse(Buffer.from(charge, "base64url").toString()).exp;
    return typeof exp !== "number" || exp * 1000 > maintenant.getTime();
  } catch {
    return false;
  }
}

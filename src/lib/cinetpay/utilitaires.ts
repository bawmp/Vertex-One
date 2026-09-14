/**
 * Logique pure du module CinetPay (préfixage d'identifiant, mappage
 * d'opérateur) — isolée de src/lib/cinetpay/client.ts (qui importe
 * "server-only") pour rester testable directement en Vitest, même patron
 * que src/lib/branding.ts pour entreprise-branding.ts.
 */

// Même patron de préfixage que idExterneUtilisateur()/idExterneCanal()
// (src/lib/chat/client.ts) — CinetPay ne connaît pas nos entreprises
// clientes, seulement des transaction_id dans un espace de noms partagé
// entre toutes ; le webhook de notification (route publique, sans session)
// retrouve ainsi l'entrepriseId sans avoir besoin d'une lecture anonyme en
// base (voir src/db/schema.ts, tentativePaiementFacture).
export function idTransactionExterne(entrepriseId: string, tentativeId: string): string {
  return `${entrepriseId}__${tentativeId}`;
}

export function analyserIdTransactionExterne(transactionId: string): { entrepriseId: string; tentativeId: string } | null {
  const separateur = transactionId.indexOf("__");
  if (separateur === -1) return null;
  return { entrepriseId: transactionId.slice(0, separateur), tentativeId: transactionId.slice(separateur + 2) };
}

/** CinetPay renvoie un identifiant d'opérateur (ex. "OM"/"MOMO") — mappé sur l'enum moyenPaiement existant, jamais une nouvelle valeur ad hoc. */
export function moyenPaiementDepuisOperateur(operateur: string | undefined): "orange_money" | "mtn_momo" {
  if (!operateur) return "mtn_momo";
  return /orange|^om$/i.test(operateur) ? "orange_money" : "mtn_momo";
}

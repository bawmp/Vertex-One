/**
 * Logique pure du module CinetPay — isolée de src/lib/cinetpay/client.ts
 * (qui importe "server-only") pour rester testable directement en Vitest,
 * même patron que src/lib/branding.ts pour entreprise-branding.ts.
 */

/**
 * CinetPay renvoie un identifiant d'opérateur (ex. "OM"/"MOMO") — mappé sur
 * l'enum moyenPaiement existant, jamais une nouvelle valeur ad hoc.
 *
 * Depuis la migration vers cinetpay-js (2026-09-18), l'API de vérification
 * de statut (client.payment.getStatus()) ne renvoie plus cette information
 * du tout (voir PaymentStatus dans node_modules/cinetpay-js/dist/index.d.ts)
 * — cette fonction est donc systématiquement appelée avec `undefined` et
 * retombe sur son défaut "mtn_momo", exactement comme avant quand CinetPay
 * ne renvoyait pas cette donnée de façon fiable.
 */
export function moyenPaiementDepuisOperateur(operateur: string | undefined): "orange_money" | "mtn_momo" {
  if (!operateur) return "mtn_momo";
  return /orange|^om$/i.test(operateur) ? "orange_money" : "mtn_momo";
}

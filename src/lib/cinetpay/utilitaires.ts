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

/**
 * CinetPay exige un numéro au format international (+XXXXXXXXXXXX) et rejette le
 * format local avec lequel les contacts sont saisis au Cameroun (« 690 11 12 22 »).
 * Ajoute l'indicatif +237 à un numéro camerounais local (9 chiffres commençant par 6 ou
 * 2), convertit « 00237… » et « 237… » en « +237… », et laisse tout autre numéro
 * déjà international inchangé. Renvoie une chaîne vide pour un numéro inexploitable :
 * l'appelant n'envoie alors aucun numéro (le champ est facultatif chez CinetPay).
 */
export function telephoneInternational(brut: string | null | undefined): string {
  const nettoye = (brut ?? "").replace(/[\s.\-()]/g, "");
  if (!nettoye) return "";
  if (nettoye.startsWith("+")) return /^\+\d{8,15}$/.test(nettoye) ? nettoye : "";
  if (nettoye.startsWith("00")) return /^\d{10,17}$/.test(nettoye) ? `+${nettoye.slice(2)}` : "";
  if (/^237[26]\d{8}$/.test(nettoye)) return `+${nettoye}`;
  if (/^[26]\d{8}$/.test(nettoye)) return `+237${nettoye}`;
  return "";
}

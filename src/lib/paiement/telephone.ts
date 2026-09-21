/**
 * Numéro au format international (+XXXXXXXXXXXX) — exigé par les prestataires Mobile Money (CinetPay hier ; CamPay pour un
 * paiement « collect » par USSD), alors que les contacts sont saisis au format local (« 690 11 12 22 »).
 * Ajoute l'indicatif +237 à un numéro camerounais local (9 chiffres commençant par 6 ou 2), convertit « 00237… » et
 * « 237… » en « +237… », et laisse tout autre numéro déjà international inchangé. Renvoie une chaîne vide pour un numéro
 * inexploitable.
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

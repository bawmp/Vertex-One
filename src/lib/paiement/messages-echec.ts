import { m } from "@/lib/i18n/catalogue";
import type { RaisonEchec } from "@/lib/paiement/types";

/**
 * Phrase (clé française, à passer à t() à l'affichage) qui explique au client pourquoi son paiement n'a pas abouti.
 * Sans raison connue (échec antérieur au suivi des raisons, prestataire muet), le texte générique de l'écran reste seul.
 */
export function messageEchecPaiement(raison: string | null | undefined): string | null {
  switch (raison as RaisonEchec | null | undefined) {
    case "SOLDE_OU_COMPTE":
      return m("Votre opérateur a refusé le paiement : solde Mobile Money insuffisant, ou compte non autorisé à payer. Vérifiez votre solde (par exemple en composant *126# pour MTN), puis réessayez.");
    case "EXPIRE":
      return m("La demande de paiement a expiré avant d'être validée. Vous pouvez réessayer et la valider dès qu'elle arrive sur votre téléphone.");
    case "ANNULE":
      return m("Le paiement a été annulé ou refusé sur votre téléphone. Aucun montant n'a été débité. Vous pouvez réessayer.");
    default:
      return null;
  }
}

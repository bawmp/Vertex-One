/** Types communs aux prestataires de paiement : la confirmation d'un paiement (confirmation.ts) ne dépend d'aucun prestataire. */

export type StatutPaiement = "ACCEPTED" | "REFUSED" | "PENDING" | "INCONNU";

/** Modes de paiement enregistrés (enum `moyen_paiement` de la base). Un paiement par carte est rangé sous « virement » : même compte bancaire (512000). */
export type MoyenPaiementEnLigne = "orange_money" | "mtn_momo" | "virement";

export type ResultatVerification = {
  statut: StatutPaiement;
  /** Le prestataire n'a pas pu être interrogé (réseau, erreur serveur) : à réessayer, à ne pas confondre avec « transaction inconnue ». */
  indisponible: boolean;
  /** Notre référence (voir referenceExterne()), telle que le prestataire la renvoie à la relecture — jamais celle d'une notification. */
  referenceExterne?: string;
  montant?: number;
  operateur?: string;
};

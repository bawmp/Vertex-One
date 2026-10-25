/**
 * Règles du paiement en plusieurs fois (tranches), sans accès à la base : utilisables aussi bien côté serveur que dans le navigateur
 * (le formulaire de paiement y vérifie la tranche saisie avant de l'envoyer — le serveur, lui, la revérifie toujours).
 * Le solde d'une facture se calcule TOUJOURS à partir des règlements enregistrés, jamais de son statut : le statut n'en est que la
 * conséquence (voir statutApresReglement). La lecture en base est dans solde.ts.
 */
/** Plus petite tranche acceptée (FCFA) ; quand le solde restant est plus petit, c'est le solde entier. */
export const TRANCHE_MINIMUM = 1_000;

/** Une tentative de paiement « en attente » depuis moins de ce délai réserve son montant : on ne peut pas encore le redemander. */
export const DELAI_RESERVATION_TENTATIVE_MS = 5 * 60 * 1000;

export type Solde = { paye: number; solde: number };

export function calculerSolde(montantTTC: number, reglements: { montant: number }[]): Solde {
  const paye = reglements.reduce((somme, r) => somme + r.montant, 0);
  return { paye, solde: Math.max(0, montantTTC - paye) };
}

/** Plus petite tranche permise pour un solde donné : jamais plus que le solde lui-même. */
export function trancheMinimale(soldeDisponible: number): number {
  return Math.min(TRANCHE_MINIMUM, soldeDisponible);
}

/**
 * Montant d'une tentative de paiement. `montantDemande` absent = tout le solde. `reserve` = montants déjà engagés par des tentatives
 * encore en attente (invite envoyée, pas encore validée) : ils ne sont plus disponibles pour une nouvelle tentative.
 * Le client ne peut jamais payer plus que ce qui reste dû, ni un montant fractionnaire, ni une tranche dérisoire.
 */
export function determinerMontantTranche(params: { solde: number; reserve: number; montantDemande: unknown; tranchesAutorisees: boolean }): { montant: number } | { erreur: string } {
  const disponible = params.solde - params.reserve;
  if (disponible <= 0) return { erreur: "Un paiement est déjà en cours pour le solde de cette facture : validez-le sur votre téléphone ou patientez un instant." };

  if (params.montantDemande === undefined || params.montantDemande === null) return { montant: disponible };
  const montant = params.montantDemande;
  if (typeof montant !== "number" || !Number.isInteger(montant) || montant <= 0) return { erreur: "Montant invalide." };
  if (montant > disponible) return { erreur: "Ce montant dépasse le solde restant à payer." };
  if (montant === disponible) return { montant };
  if (!params.tranchesAutorisees) return { erreur: "Cette entreprise n'accepte pas le paiement en plusieurs fois : réglez la totalité de la facture." };
  if (montant < trancheMinimale(disponible)) return { erreur: "Ce montant est inférieur à la tranche minimale." };
  return { montant };
}

export type StatutFactureReglee = "PAYEE" | "EN_RETARD" | "PARTIELLEMENT_PAYEE";

/**
 * Statut d'une facture après un règlement : payée dès que le total réglé atteint le montant, sinon partiellement payée — sauf une
 * facture déjà en retard, qui le reste (elle doit encore de l'argent après son échéance ; le statut « en retard » est plus utile à
 * l'équipe, et le solde restant s'affiche à côté).
 */
export function statutApresReglement(statutActuel: string, montantTTC: number, totalPaye: number): StatutFactureReglee {
  if (totalPaye >= montantTTC) return "PAYEE";
  return statutActuel === "EN_RETARD" ? "EN_RETARD" : "PARTIELLEMENT_PAYEE";
}

export type NatureTentative = "FACTURE" | "ABONNEMENT";

const PREFIXES: Record<NatureTentative, string> = { FACTURE: "fac_", ABONNEMENT: "abo_" };

/**
 * Référence transmise au prestataire de paiement = préfixe + id de la ligne de tentative (cuid2). Le préfixe distingue une facture d'un client d'un abonnement à Vertex One dans les journaux du prestataire.
 * Jamais un identifiant métier (facture, entreprise) : seul l'id de la tentative, sans signification hors de notre base.
 */
export function referenceExterne(nature: NatureTentative, idTentative: string): string {
  return PREFIXES[nature] + idTentative;
}

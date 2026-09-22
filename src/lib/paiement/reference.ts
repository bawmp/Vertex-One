export type NatureTentative = "FACTURE" | "ABONNEMENT";

const PREFIXES: Record<NatureTentative, string> = { FACTURE: "fac_", ABONNEMENT: "abo_" };

/**
 * Référence transmise au prestataire de paiement = préfixe + id de la ligne de tentative (cuid2). Le préfixe dit au webhook,
 * unique pour toute l'application côté prestataire, dans quelle table chercher (facture d'un client, ou abonnement à Vertex One).
 * Jamais un identifiant métier (facture, entreprise) : seul l'id de la tentative, sans signification hors de notre base.
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

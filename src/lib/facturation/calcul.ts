// Montants en francs CFA (entiers, voir src/db/schema.ts) — arrondi à chaque
// ligne plutôt qu'une seule fois à la fin, pour que la somme des lignes
// affichées corresponde toujours exactement au total affiché.
export type LigneCalculable = { quantite: number; prixUnitaire: number; tauxTVA: number };

export function calculerMontants(lignes: LigneCalculable[]) {
  let montantHT = 0;
  let montantTVA = 0;

  for (const ligne of lignes) {
    const totalLigneHT = Math.round(ligne.quantite * ligne.prixUnitaire);
    montantHT += totalLigneHT;
    montantTVA += Math.round(totalLigneHT * (ligne.tauxTVA / 100));
  }

  return { montantHT, montantTVA, montantTTC: montantHT + montantTVA };
}

export function formaterFCFA(montant: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(montant) + " FCFA";
}

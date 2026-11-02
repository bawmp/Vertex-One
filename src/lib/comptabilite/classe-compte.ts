// Règles pures des comptes personnalisés, séparées du code de base de données pour que le navigateur puisse les lire.
/** Règle pure. Renvoie la classe (1 à 8) d'un numéro valide, sinon null. */
export function classeDuNumero(numero: string): number | null {
  return /^[1-8]\d{5}$/.test(numero) ? Number(numero[0]) : null;
}

export function nettoyerLibelle(libelle: string): string {
  return libelle.replace(/\s+/g, " ").trim();
}

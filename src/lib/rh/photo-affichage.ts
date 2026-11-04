/**
 * Affichage de la photo d'un collaborateur : fonctions pures, sans aucune dépendance serveur, utilisables dans un composant client.
 * (Le téléversement et le stockage sont dans photo.ts, réservé au serveur.)
 */

/** Adresse relative de la photo (servie par la route contrôlée /app/rh/photo/...), ou null s'il n'y en a pas. */
export const adressePhoto = (type: "utilisateur" | "stagiaire", id: string, cle: string | null) => (cle ? `/app/rh/photo/${type}/${id}` : null);

/** Initiales d'un nom (deux lettres au plus) pour l'avatar sans photo. */
export function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  return ((mots[0][0] ?? "") + (mots.length > 1 ? (mots[mots.length - 1][0] ?? "") : "")).toUpperCase();
}

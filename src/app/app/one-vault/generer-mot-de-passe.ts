// Générateur simple côté client — window.crypto.getRandomValues() suffit,
// aucune bibliothèque nécessaire pour une chaîne aléatoire de ce genre.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_";

export function genererMotDePasse(longueur = 20): string {
  const octets = new Uint32Array(longueur);
  window.crypto.getRandomValues(octets);
  return Array.from(octets, (n) => ALPHABET[n % ALPHABET.length]).join("");
}

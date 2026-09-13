// Validation serveur du CV — jamais fait confiance au seul attribut `accept`
// du <input type="file"> côté client, qui ne bloque rien côté serveur.
export const TYPES_MIME_CV_ACCEPTES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
export const TAILLE_MAX_CV_OCTETS = 5_000_000;

export function cvValide(fichier: File): string | null {
  if (fichier.size === 0) return "Sélectionnez un CV.";
  if (fichier.size > TAILLE_MAX_CV_OCTETS) return "Le CV ne doit pas dépasser 5 Mo.";
  if (!TYPES_MIME_CV_ACCEPTES.includes(fichier.type)) return "Le CV doit être un fichier PDF ou Word.";
  return null;
}

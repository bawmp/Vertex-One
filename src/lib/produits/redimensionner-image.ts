/**
 * Réduit une photo AVANT son envoi (2026-11-13). Une photo de téléphone dépasse souvent 4 Mo : sans cela, l'envoi échouerait avec un message
 * que personne ne comprend. Une image déjà petite et dans un format accepté part telle quelle ; sinon elle est redessinée à 1600 px au plus
 * et enregistrée en JPEG (fond blanc pour une image transparente). Le serveur revérifie de toute façon les octets et la taille : ce code ne
 * sert qu'au confort, jamais à la sécurité. En cas d'échec (navigateur ancien, image illisible) le fichier d'origine est renvoyé tel quel.
 */
const COTE_MAX = 1600;
const SEUIL_OCTETS = 1_000_000;
const FORMATS_ACCEPTES = ["image/jpeg", "image/png", "image/webp"];

export async function preparerImage(fichier: File): Promise<File> {
  if (!fichier.type.startsWith("image/")) return fichier;
  try {
    // `imageOrientation: "from-image"` applique l'orientation EXIF : une photo prise à la verticale ne ressort pas couchée.
    const image = await createImageBitmap(fichier, { imageOrientation: "from-image" });
    const echelle = Math.min(1, COTE_MAX / Math.max(image.width, image.height));
    const dejaBon = FORMATS_ACCEPTES.includes(fichier.type) && fichier.size <= SEUIL_OCTETS && echelle === 1;
    if (dejaBon) {
      image.close();
      return fichier;
    }
    const largeur = Math.max(1, Math.round(image.width * echelle));
    const hauteur = Math.max(1, Math.round(image.height * echelle));
    const toile = document.createElement("canvas");
    toile.width = largeur;
    toile.height = hauteur;
    const contexte = toile.getContext("2d");
    if (!contexte) {
      image.close();
      return fichier;
    }
    contexte.fillStyle = "#ffffff";
    contexte.fillRect(0, 0, largeur, hauteur);
    contexte.drawImage(image, 0, 0, largeur, hauteur);
    image.close();
    const blob = await new Promise<Blob | null>((ok) => toile.toBlob(ok, "image/jpeg", 0.85));
    // Le résultat ne sert que s'il existe, et s'il n'est pas plus lourd qu'un fichier d'origine déjà dans un format accepté et à la bonne taille.
    if (!blob || (blob.size >= fichier.size && FORMATS_ACCEPTES.includes(fichier.type) && echelle === 1)) return fichier;
    return new File([blob], `${fichier.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
  } catch {
    return fichier;
  }
}

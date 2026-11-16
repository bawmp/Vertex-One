import sharp from "sharp";

/**
 * Logo de l'entreprise rendu très pâle, pour le filigrane d'un document rédigé (Word et feuille à l'écran) : l'opacité est écrite DANS l'image
 * (canal alpha multiplié), car Word ne sait pas rendre une image flottante à moitié transparente. Le PDF, lui, utilise l'opacité de react-pdf.
 * PNG ou JPEG en entrée (les deux formats que `chargerIdentite` accepte) ; réduit à `tailleMax` pixels au plus (le filigrane est grand mais flou).
 * Renvoie null si l'image est illisible : le document sort alors sans filigrane, jamais en échec.
 */
export const OPACITE_FILIGRANE = 0.13;

export async function logoEstompePNG(octets: Buffer, opacite = OPACITE_FILIGRANE, tailleMax = 600): Promise<{ octets: Buffer; largeur: number; hauteur: number } | null> {
  try {
    const { data, info } = await sharp(octets)
      .resize({ width: tailleMax, height: tailleMax, fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * opacite);
    const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    return { octets: png, largeur: info.width, hauteur: info.height };
  } catch {
    return null;
  }
}

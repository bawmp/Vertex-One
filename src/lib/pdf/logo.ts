import sharp from "sharp";
import { lireObjetStockage, urlTelechargementDocument } from "@/lib/documents/stockage";

/**
 * Logo d'une entreprise tel qu'il est donné au PDF. react-pdf ne dessine que le PNG et le JPEG, alors que le
 * téléversement accepte toute image : un logo SVG, WebP ou GIF est donc converti en PNG à la volée (le fichier d'origine
 * reste intact dans le stockage) ; un PNG ou un JPEG est passé par son adresse signée, comme avant.
 */
export function logoDirectementLisiblePourPDF(typeMime: string | null | undefined): boolean {
  return typeMime === "image/png" || typeMime === "image/jpeg" || typeMime === "image/jpg";
}

/** Formats que sharp sait convertir (le SVG, vectoriel, est tramé à une largeur suffisante pour rester net à l'impression). */
export function logoConvertibleEnPNG(typeMime: string | null | undefined): boolean {
  return typeMime === "image/svg+xml" || typeMime === "image/webp" || typeMime === "image/gif";
}

/**
 * Un SVG qui contient du TEXTE dépend des polices installées sur le serveur, qui manquent : les lettres deviendraient des
 * carrés. On ne le convertit pas (document sans logo, plutôt qu'un logo abîmé) ; un SVG dont les lettres sont déjà
 * converties en tracés se convertit sans problème. Un PNG ou un JPEG est toujours rendu fidèlement.
 */
export function svgContientDuTexte(octets: Buffer): boolean {
  return /<(?:svg:)?(?:text|tspan)[\s>]/i.test(octets.toString("utf8"));
}

const LARGEUR_MAX_PX = 800;

/** Convertit une image en PNG de largeur raisonnable (jamais agrandie au-delà de LARGEUR_MAX_PX, 1re image d'un GIF animé). */
export async function convertirLogoEnPNG(octets: Buffer): Promise<Buffer> {
  return sharp(octets, { density: 300 })
    .resize({ width: LARGEUR_MAX_PX, withoutEnlargement: false })
    .png()
    .toBuffer();
}

/**
 * Adresse (ou données intégrées) du logo pour le PDF, ou null — un logo manquant, illisible ou impossible à convertir ne
 * doit jamais empêcher l'émission d'un devis ou d'une facture : le document sort alors sans logo.
 */
export async function logoPourPDF(cleStockage: string | null, typeMime: string | null | undefined): Promise<string | null> {
  if (!cleStockage) return null;
  try {
    if (logoDirectementLisiblePourPDF(typeMime)) return await urlTelechargementDocument(cleStockage);
    if (logoConvertibleEnPNG(typeMime)) {
      const octets = await lireObjetStockage(cleStockage);
      if (!octets) return null;
      if (typeMime === "image/svg+xml" && svgContientDuTexte(octets)) {
        console.warn("[pdf] logo SVG contenant du texte (polices absentes du serveur) : document généré sans logo. Un logo PNG ou JPEG est conseillé.");
        return null;
      }
      return `data:image/png;base64,${(await convertirLogoEnPNG(octets)).toString("base64")}`;
    }
    return null;
  } catch (erreur) {
    console.error("[pdf] logo indisponible, document généré sans logo :", erreur instanceof Error ? erreur.message : erreur);
    return null;
  }
}

import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { entreprise } from "@/db/schema";
import { lireObjetStockage } from "@/lib/documents/stockage";
import { groupeNomPourPDF } from "@/lib/pdf/groupe";

/**
 * Identité de l'entreprise reprise en en-tête d'un document rédigé : nom, coordonnées légales, logo, couleur de marque,
 * et le groupe auquel elle appartient (même mention que les devis et factures, voir src/lib/pdf/groupe.ts).
 */
export type IdentiteDocument = {
  nom: string;
  adresse: string | null;
  ville: string | null;
  niu: string | null;
  rccm: string | null;
  couleur: string;
  groupeNom: string | null;
  /** Logo en octets (PNG ou JPEG seulement : les deux formats que PDF et Word savent intégrer), sinon null. */
  logo: { octets: Buffer; format: "png" | "jpeg" } | null;
};

export const COULEUR_PAR_DEFAUT = "#233c7e";

export function formatImage(octets: Buffer): "png" | "jpeg" | null {
  if (octets.length > 8 && octets.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (octets.length > 3 && octets[0] === 0xff && octets[1] === 0xd8 && octets[2] === 0xff) return "jpeg";
  return null;
}

/** Largeur et hauteur d'une image PNG ou JPEG (lues dans l'en-tête du fichier), ou null si illisible. */
export function dimensionsImage(octets: Buffer): { largeur: number; hauteur: number } | null {
  const format = formatImage(octets);
  if (format === "png" && octets.length >= 24) return { largeur: octets.readUInt32BE(16), hauteur: octets.readUInt32BE(20) };
  if (format === "jpeg") {
    let i = 2;
    while (i + 9 < octets.length) {
      if (octets[i] !== 0xff) return null;
      const marqueur = octets[i + 1];
      const longueur = octets.readUInt16BE(i + 2);
      // SOF0..SOF15 (hors DHT/JPG/DAC) portent les dimensions
      if (marqueur >= 0xc0 && marqueur <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marqueur)) return { hauteur: octets.readUInt16BE(i + 5), largeur: octets.readUInt16BE(i + 7) };
      i += 2 + longueur;
    }
  }
  return null;
}

export function octetsDepuisDataUrl(src: string): { octets: Buffer; format: "png" | "jpeg" } | null {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(src);
  if (!m) return null;
  return { octets: Buffer.from(m[2], "base64"), format: m[1] as "png" | "jpeg" };
}

/** À appeler dans avecEntreprise(entrepriseId, …). */
export async function chargerIdentite(tx: TransactionDrizzle, entrepriseId: string): Promise<IdentiteDocument> {
  const [e] = await tx.select().from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (!e) throw new Error("Entreprise introuvable.");
  let logo: IdentiteDocument["logo"] = null;
  if (e.logoCleStockage) {
    try {
      const octets = await lireObjetStockage(e.logoCleStockage);
      const format = octets ? formatImage(octets) : null;
      if (octets && format) logo = { octets, format };
    } catch {
      logo = null; // un logo illisible ne bloque jamais l'export : le document sort sans
    }
  }
  return {
    nom: e.nom,
    adresse: e.adresse,
    ville: e.ville,
    niu: e.niu,
    rccm: e.rccm,
    couleur: e.couleurMarque ?? COULEUR_PAR_DEFAUT,
    groupeNom: await groupeNomPourPDF(tx, e.nom, e.groupeId),
    logo,
  };
}

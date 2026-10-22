import { z } from "zod";

/**
 * Mise en page d'un document rédigé : en-tête, pied de page, numérotation, marges. Revalidée côté serveur à chaque
 * enregistrement (jamais de confiance dans les valeurs du navigateur) ; toute valeur absente ou invalide retombe sur le défaut.
 */
export const NUMEROTATIONS = ["AUCUNE", "PAGE", "PAGE_SUR_TOTAL"] as const;
export const POSITIONS = ["GAUCHE", "CENTRE", "DROITE"] as const;
export const MARGES = ["ETROITES", "NORMALES", "LARGES"] as const;
export const PAGES_ENTETE = ["TOUTES", "PREMIERE", "SUIVANTES"] as const;

const texteCourt = (max: number) => z.string().max(max).catch("");

export const schemaMiseEnPage = z.object({
  /** Identité de l'entreprise en en-tête : logo, nom, adresse, NIU/RCCM (et mention du groupe s'il y en a un). */
  enteteEntreprise: z.boolean().catch(true),
  /** Textes libres de l'en-tête (ex. « Confidentiel », « Dossier n° 12 »). */
  enteteGauche: texteCourt(120),
  enteteDroite: texteCourt(120),
  /** Textes libres du pied de page (ex. mentions légales, adresse, site web). */
  piedGauche: texteCourt(200),
  piedCentre: texteCourt(200),
  piedDroite: texteCourt(200),
  numerotation: z.enum(NUMEROTATIONS).catch("PAGE_SUR_TOTAL"),
  numerotationPosition: z.enum(POSITIONS).catch("DROITE"),
  /** Référence du document, affichée en en-tête (ex. « CT-2026-014 »). */
  reference: texteCourt(60),
  /** Date du jour d'édition en en-tête (date de l'export, jamais figée). */
  afficherDate: z.boolean().catch(false),
  /** Où apparaît l'en-tête : toutes les pages ; la première seulement (papier à en-tête) ; les suivantes seulement, en version compacte sans logo. */
  pagesEntete: z.enum(PAGES_ENTETE).catch("TOUTES"),
  marges: z.enum(MARGES).catch("NORMALES"),
});

export type MiseEnPage = z.infer<typeof schemaMiseEnPage>;

export function miseEnPageParDefaut(): MiseEnPage {
  return schemaMiseEnPage.parse({});
}

export function validerMiseEnPage(brut: unknown): MiseEnPage {
  return schemaMiseEnPage.parse(brut && typeof brut === "object" ? brut : {});
}

/** Marges en points PDF (1 mm ≈ 2,835 pt) et en « twips » Word (1 mm ≈ 56,7 twips). */
const MARGES_MM: Record<MiseEnPage["marges"], number> = { ETROITES: 15, NORMALES: 20, LARGES: 28 };
export const margeMm = (m: MiseEnPage["marges"]): number => MARGES_MM[m];
export const margePt = (m: MiseEnPage["marges"]): number => Math.round(MARGES_MM[m] * 2.835);
export const margeTwips = (m: MiseEnPage["marges"]): number => Math.round(MARGES_MM[m] * 56.7);

/** Libellé de pagination : « 3 », « 3 / 12 » ou rien. `total` inconnu (null) donne « 3 / … ». */
export function libellePage(numerotation: MiseEnPage["numerotation"], page: number, total: number | null): string {
  if (numerotation === "AUCUNE") return "";
  return numerotation === "PAGE" ? `Page ${page}` : `Page ${page} / ${total ?? "…"}`;
}

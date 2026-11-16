import { describe, test, expect, vi } from "vitest";
import { inflateSync } from "node:zlib";
import JSZip from "jszip";
import sharp from "sharp";

vi.mock("server-only", () => ({}));

import { rendreDocumentRedigePDF } from "@/lib/redaction/rendu-pdf";
import { rendreDocumentRedigeDocx } from "@/lib/redaction/rendu-docx";
import { validerMiseEnPage } from "@/lib/redaction/mise-en-page";
import { logoEstompePNG, OPACITE_FILIGRANE } from "@/lib/redaction/filigrane";
import type { IdentiteDocument } from "@/lib/redaction/identite";
import type { ContenuRedaction } from "@/lib/redaction/contenu";

/**
 * Le logo de l'entreprise est en filigrane sur chaque page d'un document rédigé (PDF et Word), comme sur ses devis et factures, selon le même
 * réglage (Paramètres → Personnalisation). Sans logo, ou réglage décoché, le document est inchangé.
 */
async function logoDeTest(): Promise<Buffer> {
  return sharp({ create: { width: 60, height: 40, channels: 4, background: { r: 35, g: 60, b: 126, alpha: 1 } } }).png().toBuffer();
}
const identiteDe = async (surcharges: Partial<IdentiteDocument> = {}): Promise<IdentiteDocument> => ({
  nom: "ENTREPRISE TEST", adresse: "Mendong", ville: "Yaoundé", niu: null, rccm: null, couleur: "#233c7e", groupeNom: null,
  logo: { octets: await logoDeTest(), format: "png" }, filigrane: true, ...surcharges,
});
const contenuLong = (): ContenuRedaction => ({
  type: "doc",
  content: Array.from({ length: 90 }, (_, i) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text: `Paragraphe de remplissage numéro ${i + 1} pour passer sur plusieurs pages.` }] })),
});

function nombreDePages(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}
/** Affichages d'image (opérateur `Do`) dans le contenu des pages, flux décompressés : une image réutilisée sur deux pages en compte deux. */
function affichagesDImages(pdf: Buffer): number {
  let total = 0;
  for (const m of pdf.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      total += (inflateSync(Buffer.from(m[1], "latin1")).toString("latin1").match(/\/\w+\s+Do\b/g) ?? []).length;
    } catch {
      // flux qui n'est pas compressé (image, police) : ignoré
    }
  }
  return total;
}
const dateEdition = new Date("2026-11-16T10:00:00Z");

describe("Document rédigé — filigrane PDF", () => {
  test("le logo est ajouté en filigrane sur CHAQUE page ; réglage décoché ou sans logo : aucun ajout", async () => {
    const miseEnPage = validerMiseEnPage({});
    const rendre = async (identite: IdentiteDocument) => rendreDocumentRedigePDF({ titre: "Contrat", contenu: contenuLong(), miseEnPage, identite, dateEdition });
    const avec = await rendre(await identiteDe());
    const sans = await rendre(await identiteDe({ filigrane: false }));
    const sansLogo = await rendre(await identiteDe({ logo: null }));
    const pages = nombreDePages(avec);
    expect(pages).toBeGreaterThan(1);
    expect(nombreDePages(sans)).toBe(pages);
    expect(affichagesDImages(avec) - affichagesDImages(sans)).toBe(pages); // une image de plus par page
    expect(affichagesDImages(sansLogo)).toBe(0);
  }, 120_000);

  test("fonctionne aussi quand l'en-tête est absent, ou réservé aux pages suivantes", async () => {
    for (const reglages of [{ enteteEntreprise: false }, { reference: "REF-1", pagesEntete: "SUIVANTES" }, { reference: "REF-1", pagesEntete: "PREMIERE" }]) {
      const miseEnPage = validerMiseEnPage(reglages);
      const avec = await rendreDocumentRedigePDF({ titre: "x", contenu: contenuLong(), miseEnPage, identite: await identiteDe(), dateEdition });
      const sans = await rendreDocumentRedigePDF({ titre: "x", contenu: contenuLong(), miseEnPage, identite: await identiteDe({ filigrane: false }), dateEdition });
      expect(affichagesDImages(avec) - affichagesDImages(sans), JSON.stringify(reglages)).toBe(nombreDePages(avec));
    }
  }, 180_000);
});

describe("Document rédigé — filigrane Word", () => {
  async function entetes(identite: IdentiteDocument, reglages: Record<string, unknown> = {}) {
    const zip = await JSZip.loadAsync(await rendreDocumentRedigeDocx({ titre: "x", contenu: contenuLong(), miseEnPage: validerMiseEnPage(reglages), identite, dateEdition }));
    return Promise.all(Object.keys(zip.files).filter((f) => /word\/header\d*\.xml$/.test(f)).map(async (f) => zip.file(f)!.async("string")));
  }
  const derriere = (xml: string) => /behindDoc="1"/.test(xml);

  test("image flottante derrière le texte, centrée sur la page, dans CHAQUE en-tête (première page comprise)", async () => {
    for (const reglages of [{}, { pagesEntete: "PREMIERE", reference: "R" }, { pagesEntete: "SUIVANTES", reference: "R" }]) {
      const h = await entetes(await identiteDe(), reglages);
      expect(h.length, JSON.stringify(reglages)).toBeGreaterThanOrEqual(1);
      expect(h.every(derriere), JSON.stringify(reglages)).toBe(true);
      expect(h.every((x) => /<wp:positionH relativeFrom="page">[\s\S]*center/.test(x) && /<wp:positionV relativeFrom="page">[\s\S]*center/.test(x))).toBe(true);
    }
  }, 120_000);

  test("sans en-tête du tout, le filigrane existe quand même (première page et suivantes)", async () => {
    const h = await entetes(await identiteDe(), { enteteEntreprise: false, enteteGauche: "", enteteDroite: "", reference: "", afficherDate: false });
    expect(h.length).toBeGreaterThanOrEqual(2);
    expect(h.every(derriere)).toBe(true);
  }, 120_000);

  test("réglage décoché ou sans logo : aucun filigrane", async () => {
    expect((await entetes(await identiteDe({ filigrane: false }))).some(derriere)).toBe(false);
    expect((await entetes(await identiteDe({ logo: null }))).some(derriere)).toBe(false);
  }, 120_000);
});

describe("Logo estompé", () => {
  test("la transparence est écrite dans l'image : un logo opaque ressort à environ 13 % d'opacité, dimensions conservées", async () => {
    const r = await logoEstompePNG(await logoDeTest());
    expect(r).not.toBeNull();
    const { data, info } = await sharp(r!.octets).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    expect(r!.largeur / r!.hauteur).toBeCloseTo(60 / 40, 1);
    const alpha = data[3];
    expect(alpha).toBe(Math.round(255 * OPACITE_FILIGRANE));
    expect([data[0], data[1], data[2]]).toEqual([35, 60, 126]); // la couleur du logo n'est pas touchée
  });

  test("grande image réduite à 600 px au plus ; image illisible → null (le document sort sans filigrane, jamais en échec)", async () => {
    const grande = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#fff" } }).png().toBuffer();
    const r = await logoEstompePNG(grande);
    expect(Math.max(r!.largeur, r!.hauteur)).toBe(600);
    expect(await logoEstompePNG(Buffer.from("pas une image"))).toBeNull();
  });
});

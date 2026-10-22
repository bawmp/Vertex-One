import { describe, test, expect, vi } from "vitest";

// « server-only » interdit l'import hors d'un composant serveur : sans effet pour un test Node.
vi.mock("server-only", () => ({}));

import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { validerContenu, texteBrut, LIMITES, type ContenuRedaction } from "@/lib/redaction/contenu";
import { validerMiseEnPage, miseEnPageParDefaut, libellePage } from "@/lib/redaction/mise-en-page";
import { rendreDocumentRedigePDF } from "@/lib/redaction/rendu-pdf";
import { rendreDocumentRedigeDocx } from "@/lib/redaction/rendu-docx";
import type { IdentiteDocument } from "@/lib/redaction/identite";

/**
 * Documents rédigés (2026-10-22) : le contenu envoyé par le navigateur est revalidé en liste blanche, puis converti en PDF
 * et en Word avec en-tête, pied de page et numéros de page. Aucun accès base de données : tests purs.
 */
// PNG 1×1 rouge
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const IMAGE = `data:image/png;base64,${PNG}`;

const identite: IdentiteDocument = { nom: "GLOBAL MOBILITY", adresse: "Mendong", ville: "Yaoundé", niu: "M0123456789", rccm: "RC/YAO/2026/B/1", couleur: "#233c7e", groupeNom: "VERTEX TECHNOLOGY", logo: { octets: Buffer.from(PNG, "base64"), format: "png" } };

const para = (texte: string, marks?: { type: "bold" | "italic" | "underline" | "strike" }[]) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text: texte, ...(marks ? { marks } : {}) }] });

function documentLong(): ContenuRedaction {
  const blocs: ContenuRedaction["content"] = [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Contrat de prestation" }] },
    para("Premier paragraphe en gras", [{ type: "bold" }]),
    { type: "bulletList", content: [{ type: "listItem", content: [para("Puce un")] }, { type: "listItem", content: [para("Puce deux")] }] },
    { type: "orderedList", content: [{ type: "listItem", content: [para("Étape un")] }, { type: "listItem", content: [para("Étape deux")] }] },
    { type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [para("Désignation")] }, { type: "tableHeader", content: [para("Montant")] }] }, { type: "tableRow", content: [{ type: "tableCell", content: [para("Visa")] }, { type: "tableCell", content: [para("50 000 FCFA")] }] }] },
    { type: "image", attrs: { src: IMAGE, largeur: 30 } },
  ];
  for (let i = 0; i < 90; i++) blocs.push(para(`Paragraphe de remplissage numéro ${i + 1} : le texte est assez long pour que le document dépasse plusieurs pages une fois mis en page avec ses marges.`));
  blocs.push({ type: "pageBreak" }, para("Dernière page après un saut de page"));
  return { type: "doc", content: blocs };
}

/** Texte lisible d'un PDF : décompresse les flux et décode les chaînes hexadécimales (polices standard, encodage latin). */
function textePdf(pdf: Buffer): string {
  const sortie: string[] = [];
  let i = 0;
  while ((i = pdf.indexOf("stream", i)) !== -1) {
    const debut = pdf[i + 6] === 13 ? i + 8 : i + 7;
    const fin = pdf.indexOf("endstream", debut);
    if (fin === -1) break;
    try {
      const contenu = inflateSync(pdf.subarray(debut, fin)).toString("latin1");
      for (const m of contenu.matchAll(/<([0-9a-fA-F]+)>/g)) sortie.push(Buffer.from(m[1], "hex").toString("latin1"));
      for (const m of contenu.matchAll(/\(((?:[^()\\]|\\.)*)\)/g)) sortie.push(m[1]);
    } catch {
      /* flux non compressé (police, image) : ignoré */
    }
    i = fin + 9;
  }
  return sortie.join("");
}

describe("Validation du contenu (liste blanche)", () => {
  test("le HTML, les scripts, les liens et les types inconnus sont écartés ; le texte reste", () => {
    const r = validerContenu({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Bonjour", marks: [{ type: "bold" }, { type: "link", attrs: { href: "javascript:alert(1)" } }, { type: "bold" }] }] },
        { type: "script", content: [{ type: "text", text: "alert(1)" }] },
        { type: "paragraph", content: [{ type: "html", html: "<img src=x onerror=alert(1)>" }, { type: "text", text: "<b>pas du html</b>" }] },
        { type: "image", attrs: { src: "https://exemple.test/pixel.png" } },
        { type: "image", attrs: { src: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" } },
      ],
    });
    expect("contenu" in r).toBe(true);
    if (!("contenu" in r)) return;
    const json = JSON.stringify(r.contenu);
    expect(json).not.toContain("script");
    expect(json).not.toContain("javascript");
    expect(json).not.toContain("https://");
    expect(json).not.toContain("svg");
    expect(r.contenu.content).toHaveLength(2); // les deux paragraphes seulement
    expect(texteBrut(r.contenu)).toContain("<b>pas du html</b>"); // du TEXTE : jamais interprété (échappé à l'export)
    expect(r.contenu.content[0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "Bonjour", marks: [{ type: "bold" }] }] });
  });

  test("tailles bornées : document trop gros, image trop lourde, trop d'images, contenu invalide", () => {
    expect("erreur" in validerContenu({ type: "paragraph" })).toBe(true);
    expect("erreur" in validerContenu(null)).toBe(true);
    const lourde = "data:image/png;base64," + "A".repeat(Math.ceil(((LIMITES.octetsImageMax + 10) * 4) / 3));
    const r1 = validerContenu({ type: "doc", content: [{ type: "image", attrs: { src: lourde } }] });
    expect("erreur" in r1 && r1.erreur).toMatch(/1 Mo/);
    const r2 = validerContenu({ type: "doc", content: Array.from({ length: LIMITES.imagesMax + 1 }, () => ({ type: "image", attrs: { src: IMAGE } })) });
    expect("erreur" in r2 && r2.erreur).toMatch(/images/);
    const enorme = validerContenu({ type: "doc", content: [para("x".repeat(LIMITES.octetsJsonMax))] });
    expect("erreur" in enorme && enorme.erreur).toMatch(/volumineux/);
  });

  test("attributs bornés : niveau de titre, alignement, colspan ; un document vide devient un paragraphe vide", () => {
    const r = validerContenu({ type: "doc", content: [{ type: "heading", attrs: { level: 99, textAlign: "evil" }, content: [{ type: "text", text: "T" }] }, { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 9999 }, content: [] }] }] }] });
    expect("contenu" in r).toBe(true);
    if (!("contenu" in r)) return;
    expect(r.contenu.content[0]).toEqual({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "T" }] });
    expect(JSON.stringify(r.contenu)).not.toContain("9999");
    const vide = validerContenu({ type: "doc", content: [] });
    expect("contenu" in vide && vide.contenu.content).toEqual([{ type: "paragraph" }]);
  });
});

describe("Mise en page", () => {
  test("les valeurs invalides retombent sur le défaut, sans erreur", () => {
    const m = validerMiseEnPage({ numerotation: "N'IMPORTE QUOI", marges: 12, enteteGauche: "x".repeat(500), reference: 5, afficherDate: "oui" });
    expect(m.numerotation).toBe("PAGE_SUR_TOTAL");
    expect(m.marges).toBe("NORMALES");
    expect(m.enteteGauche).toBe("");
    expect(m.reference).toBe("");
    expect(m.afficherDate).toBe(false);
    expect(validerMiseEnPage(null)).toEqual(miseEnPageParDefaut());
  });

  test("libellé de pagination", () => {
    expect(libellePage("AUCUNE", 1, 5)).toBe("");
    expect(libellePage("PAGE", 2, 5)).toBe("Page 2");
    expect(libellePage("PAGE_SUR_TOTAL", 2, 5)).toBe("Page 2 / 5");
  });
});

describe("Export PDF", () => {
  const miseEnPage = validerMiseEnPage({ reference: "CT-2026-014", afficherDate: true, enteteDroite: "Confidentiel", piedGauche: "Yaoundé, Mendong", numerotation: "PAGE_SUR_TOTAL", numerotationPosition: "DROITE" });

  test("un long document tient sur plusieurs pages, avec en-tête, pied de page et numéros sur chacune", async () => {
    const pdf = await rendreDocumentRedigePDF({ titre: "Contrat", contenu: documentLong(), miseEnPage, identite, dateEdition: new Date("2026-10-22T10:00:00Z") });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const doc = await PDFDocument.load(pdf);
    const pages = doc.getPageCount();
    expect(pages).toBeGreaterThanOrEqual(3);
    const texte = textePdf(pdf);
    for (const attendu of ["GLOBAL MOBILITY", "Une entreprise du groupe VERTEX TECHNOLOGY", "CT-2026-014", "Confidentiel", "Yaound", "Contrat de prestation", "Derni"]) expect(texte, attendu).toContain(attendu);
    // un numéro de page « Page N / total » par page, y compris la dernière
    for (let p = 1; p <= pages; p++) expect(texte, `Page ${p} / ${pages}`).toContain(`Page ${p} / ${pages}`);
    expect(texte).toContain("22 octobre 2026");
  });

  test("sans pied ni en-tête demandés, le document ne contient ni l'un ni l'autre ; « pages suivantes » saute la première, « première » ne garde que la première", async () => {
    const nu = validerMiseEnPage({ enteteEntreprise: false, numerotation: "AUCUNE" });
    const t1 = textePdf(await rendreDocumentRedigePDF({ titre: "Nu", contenu: documentLong(), miseEnPage: nu, identite, dateEdition: new Date() }));
    expect(t1).not.toContain("GLOBAL MOBILITY");
    expect(t1).not.toContain("Page 1");
    const rendre = (pagesEntete: "TOUTES" | "PREMIERE" | "SUIVANTES") => rendreDocumentRedigePDF({ titre: "x", contenu: documentLong(), miseEnPage: validerMiseEnPage({ ...miseEnPage, pagesEntete }), identite, dateEdition: new Date() });
    const compte = (t: string) => t.split("CT-2026-014").length - 1;
    const toutes = compte(textePdf(await rendre("TOUTES")));
    expect(toutes).toBeGreaterThanOrEqual(3);
    expect(compte(textePdf(await rendre("SUIVANTES")))).toBe(toutes - 1); // toutes les pages sauf la première
    expect(compte(textePdf(await rendre("PREMIERE")))).toBe(1); // la première seulement
  });

  test("le texte contenant du HTML s'affiche tel quel (jamais interprété)", async () => {
    const contenu: ContenuRedaction = { type: "doc", content: [para("<script>alert(1)</script> & <b>gras ?</b>")] };
    const t = textePdf(await rendreDocumentRedigePDF({ titre: "x", contenu, miseEnPage, identite, dateEdition: new Date() }));
    expect(t).toContain("<script>alert(1)</script> & <b>gras ?</b>");
  });
});

describe("Export Word", () => {
  test("le .docx contient le texte, l'en-tête avec le logo, le pied de page avec numéros de page, la liste, le tableau et l'image", async () => {
    const miseEnPage = validerMiseEnPage({ reference: "CT-2026-014", enteteDroite: "Confidentiel", piedGauche: "Yaoundé, Mendong", numerotation: "PAGE_SUR_TOTAL" });
    const buffer = await rendreDocumentRedigeDocx({ titre: "Contrat", contenu: documentLong(), miseEnPage, identite, dateEdition: new Date("2026-10-22T10:00:00Z") });
    expect(buffer.subarray(0, 2).toString()).toBe("PK"); // un .docx est une archive zip
    const zip = await JSZip.loadAsync(buffer);
    const lire = async (nom: string) => (await zip.file(nom)?.async("string")) ?? "";
    const corps = await lire("word/document.xml");
    expect(corps).toContain("Contrat de prestation");
    expect(corps).toContain("Paragraphe de remplissage numéro 90");
    expect(corps).toContain("Désignation");
    expect(corps).toContain("<w:tbl>");
    expect(corps).toContain("w:numPr"); // listes à puces / numérotées
    expect(corps).toContain('w:type="page"'); // saut de page
    const fichiers = Object.keys(zip.files);
    const entete = await lire(fichiers.find((f) => /word\/header\d*\.xml$/.test(f)) ?? "");
    expect(entete).toContain("GLOBAL MOBILITY");
    expect(entete).toContain("Une entreprise du groupe VERTEX TECHNOLOGY");
    expect(entete).toContain("CT-2026-014");
    expect(entete).toContain("<w:drawing>"); // logo
    const pied = await lire(fichiers.find((f) => /word\/footer\d*\.xml$/.test(f)) ?? "");
    expect(pied).toContain("Yaoundé, Mendong");
    expect(pied).toMatch(/PAGE/);
    expect(pied).toMatch(/NUMPAGES/);
    expect(fichiers.some((f) => f.startsWith("word/media/"))).toBe(true);
  });

  test("en-tête sur la première page seulement ou sur les suivantes : « première page différente » déclarée, le logo reste réservé à l'en-tête complet", async () => {
    for (const pagesEntete of ["PREMIERE", "SUIVANTES"] as const) {
      const miseEnPage = validerMiseEnPage({ reference: "CT-1", pagesEntete });
      const zip = await JSZip.loadAsync(await rendreDocumentRedigeDocx({ titre: "x", contenu: documentLong(), miseEnPage, identite, dateEdition: new Date() }));
      const corps = (await zip.file("word/document.xml")?.async("string")) ?? "";
      expect(corps, pagesEntete).toContain("w:titlePg");
      const enTetes = await Promise.all(Object.keys(zip.files).filter((f) => /word\/header\d*\.xml$/.test(f)).map(async (f) => (await zip.file(f)!.async("string"))));
      const avecLogo = enTetes.filter((x) => x.includes("<w:drawing>"));
      const avecTexte = enTetes.filter((x) => x.includes("CT-1"));
      expect(avecTexte.length, pagesEntete).toBe(1);
      // PREMIERE : l'en-tête complet (avec logo) ; SUIVANTES : l'en-tête compact (sans logo)
      expect(avecLogo.length, pagesEntete).toBe(pagesEntete === "PREMIERE" ? 1 : 0);
    }
  });
});

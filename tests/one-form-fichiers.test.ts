import { describe, test, expect } from "vitest";
import {
  detecterFormat,
  validerFichier,
  nomFichierSain,
  nomAffichable,
  categoriesDuChamp,
  categoriesValides,
  attributAccept,
  formaterTaille,
  encoderValeurFichier,
  decoderValeurFichier,
  TAILLE_MAX_TOTAL_OCTETS,
  type CategorieFichier,
} from "@/lib/one-form/fichiers";

const octets = (...valeurs: number[]) => Uint8Array.from(valeurs);
const texte = (s: string) => Uint8Array.from(Buffer.from(s, "latin1"));

const PDF = texte("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
const PNG = octets(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const JPEG = octets(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const WEBP = Uint8Array.from([...Buffer.from("RIFF"), 1, 0, 0, 0, ...Buffer.from("WEBP"), 0]);
const DOCX = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, ...Buffer.from("....word/document.xml....")]);
const XLSX = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, ...Buffer.from("....xl/workbook.xml....")]);
const ZIP_QUELCONQUE = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, ...Buffer.from("META-INF/MANIFEST.MF classes.dex")]);

const TOUT: CategorieFichier[] = ["IMAGE", "PDF", "DOCUMENT"];

describe("One Form — reconnaissance du vrai format par le contenu", () => {
  test("reconnaît PDF, PNG, JPEG, WebP, DOCX et XLSX", () => {
    expect(detecterFormat(PDF)).toMatchObject({ categorie: "PDF", extension: "pdf", mime: "application/pdf" });
    expect(detecterFormat(PNG)).toMatchObject({ categorie: "IMAGE", extension: "png" });
    expect(detecterFormat(JPEG)).toMatchObject({ categorie: "IMAGE", extension: "jpg" });
    expect(detecterFormat(WEBP)).toMatchObject({ categorie: "IMAGE", extension: "webp" });
    expect(detecterFormat(DOCX)).toMatchObject({ categorie: "DOCUMENT", extension: "docx" });
    expect(detecterFormat(XLSX)).toMatchObject({ categorie: "DOCUMENT", extension: "xlsx" });
  });

  test("refuse un SVG, du HTML, un script et un exécutable Windows, quel que soit leur nom", () => {
    expect(detecterFormat(texte('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(detecterFormat(texte("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(detecterFormat(texte("#!/bin/sh\nrm -rf /"))).toBeNull();
    expect(detecterFormat(texte("MZ\x90\x00\x03\x00\x00\x00"))).toBeNull();
  });

  test("refuse une archive ZIP qui n'est ni un DOCX ni un XLSX (jar, apk...)", () => {
    expect(detecterFormat(ZIP_QUELCONQUE)).toBeNull();
  });

  test("refuse un contenu vide ou trop court", () => {
    expect(detecterFormat(new Uint8Array(0))).toBeNull();
    expect(detecterFormat(octets(0xff, 0xd8))).toBeNull();
  });

  test("RIFF sans marqueur WEBP (ex. un WAV) n'est pas une image", () => {
    const wav = Uint8Array.from([...Buffer.from("RIFF"), 1, 0, 0, 0, ...Buffer.from("WAVE"), 0]);
    expect(detecterFormat(wav)).toBeNull();
  });
});

describe("One Form — validation d'un fichier envoyé", () => {
  test("accepte un PDF quand les PDF sont autorisés", () => {
    const r = validerFichier({ taille: PDF.length, octets: PDF, categories: ["PDF"] });
    expect(r.ok).toBe(true);
  });

  test("refuse une image quand seuls les PDF sont autorisés", () => {
    const r = validerFichier({ taille: PNG.length, octets: PNG, categories: ["PDF"] });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.erreur).toContain("PDF");
  });

  test("un faux PDF (contenu HTML nommé .pdf) est refusé : le nom ne compte jamais", () => {
    const html = texte("<html><body>piege</body></html>");
    expect(validerFichier({ taille: html.length, octets: html, categories: TOUT })).toMatchObject({ ok: false });
  });

  test("refuse un fichier vide et un fichier trop lourd", () => {
    expect(validerFichier({ taille: 0, octets: new Uint8Array(0), categories: TOUT })).toMatchObject({ ok: false });
    const r = validerFichier({ taille: TAILLE_MAX_TOTAL_OCTETS + 1, octets: PDF, categories: TOUT });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.erreur).toContain("4 Mo");
  });

  test("accepte exactement la taille maximale", () => {
    expect(validerFichier({ taille: TAILLE_MAX_TOTAL_OCTETS, octets: PDF, categories: TOUT }).ok).toBe(true);
  });
});

describe("One Form — noms de fichiers", () => {
  test("nom de stockage : ASCII, sans chemin, extension imposée par le format détecté", () => {
    expect(nomFichierSain("Relevé bancaire été.PDF", "pdf")).toBe("Releve-bancaire-ete.pdf");
    expect(nomFichierSain("../../etc/passwd", "png")).toBe("passwd.png");
    expect(nomFichierSain("..\\..\\windows\\system32\\evil.exe", "pdf")).toBe("evil.pdf");
    expect(nomFichierSain("", "jpg")).toBe("fichier.jpg");
    expect(nomFichierSain("###", "jpg")).toBe("fichier.jpg");
  });

  test("le nom de stockage est borné en longueur", () => {
    expect(nomFichierSain("a".repeat(500) + ".pdf", "pdf").length).toBeLessThanOrEqual(64);
  });

  test("nom affiché : garde les accents, retire chemin et caractères de contrôle", () => {
    expect(nomAffichable("C:\\docs\\Relevé été.pdf")).toBe("Relevé été.pdf");
    expect(nomAffichable("a\u0000b\nc.pdf")).toBe("abc.pdf");
    expect(nomAffichable("")).toBe("fichier");
  });
});

describe("One Form — catégories et attribut accept", () => {
  test("une liste vide ou inconnue autorise tout plutôt que de bloquer le champ", () => {
    expect(categoriesDuChamp(null)).toEqual(TOUT);
    expect(categoriesDuChamp([])).toEqual(TOUT);
    expect(categoriesDuChamp(["N_IMPORTE_QUOI"])).toEqual(TOUT);
    expect(categoriesDuChamp(["PDF"])).toEqual(["PDF"]);
  });

  test("categoriesValides ignore toute valeur inconnue", () => {
    expect(categoriesValides(["PDF", "EXE", "IMAGE"])).toEqual(["IMAGE", "PDF"]);
  });

  test("attribut accept dérivé des catégories", () => {
    expect(attributAccept(["PDF"])).toBe(".pdf");
    expect(attributAccept(["IMAGE", "PDF"])).toBe(".jpg,.jpeg,.png,.webp,.pdf");
  });

  test("formaterTaille", () => {
    expect(formaterTaille(500)).toBe("500 o");
    expect(formaterTaille(2048)).toBe("2 Ko");
    expect(formaterTaille(1.5 * 1024 * 1024)).toBe("1,5 Mo");
  });
});

describe("One Form — valeur stockée pour un champ fichier", () => {
  test("aller-retour encodage / décodage", () => {
    const valeur = { cle: "ent1/formulaires/f1/abc-cv.pdf", nom: "Mon CV.pdf", taille: 1234, type: "application/pdf" };
    expect(decoderValeurFichier(encoderValeurFichier(valeur))).toEqual(valeur);
  });

  test("une valeur qui n'est pas un fichier (texte libre, JSON étranger) est ignorée, jamais un crash", () => {
    expect(decoderValeurFichier("Bonjour")).toBeNull();
    expect(decoderValeurFichier('{"cle":"x"}')).toBeNull();
    expect(decoderValeurFichier('{"v":2,"cle":"x","nom":"y"}')).toBeNull();
    expect(decoderValeurFichier("")).toBeNull();
  });
});

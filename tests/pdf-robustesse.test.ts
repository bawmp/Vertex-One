import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { logoDirectementLisiblePourPDF, logoConvertibleEnPNG, convertirLogoEnPNG } from "@/lib/pdf/logo";
import { rendreDocumentCommercialPDF } from "@/lib/pdf/rendu";
import { lienEmail } from "@/lib/email/lien";

describe("PDF — logo", () => {
  test("PNG et JPEG passent tels quels ; SVG, WebP et GIF sont convertis ; le reste est ignoré", () => {
    expect(logoDirectementLisiblePourPDF("image/png")).toBe(true);
    expect(logoDirectementLisiblePourPDF("image/jpeg")).toBe(true);
    for (const convertible of ["image/svg+xml", "image/webp", "image/gif"]) {
      expect(logoDirectementLisiblePourPDF(convertible)).toBe(false);
      expect(logoConvertibleEnPNG(convertible), convertible).toBe(true);
    }
    for (const autre of ["image/tiff", "", null, undefined]) {
      expect(logoDirectementLisiblePourPDF(autre as string | null | undefined), String(autre)).toBe(false);
      expect(logoConvertibleEnPNG(autre as string | null | undefined), String(autre)).toBe(false);
    }
  });

  test("un logo SVG est converti en PNG et s'affiche (en-tête et filigrane) dans le PDF", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" viewBox="0 0 200 80"><rect width="200" height="80" fill="#233c7e"/><circle cx="40" cy="40" r="25" fill="#ed7623"/></svg>');
    const png = await convertirLogoEnPNG(svg);
    // signature PNG
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    const logoUrl = `data:image/png;base64,${png.toString("base64")}`;
    const base = {
      typeDocument: "DEVIS" as const,
      numero: "DEV-TEST",
      dateEmission: new Date("2026-10-22"),
      client: { nom: "Client", societeCliente: null, niu: null, telephone: "690000000", email: null },
      lignes: [{ designation: "Honoraires", quantite: 1, prixUnitaire: 1000, tauxTVA: 0 }],
      montantHT: 1000,
      montantTVA: 0,
      montantTTC: 1000,
    };
    const entreprise = { nom: "E", niu: null, rccm: null, adresse: null, ville: null, assujettiTVA: false };
    const avec = await rendreDocumentCommercialPDF({ ...base, entreprise: { ...entreprise, logoUrl } });
    const sans = await rendreDocumentCommercialPDF({ ...base, entreprise: { ...entreprise, logoUrl: null } });
    expect(avec.subarray(0, 4).toString()).toBe("%PDF");
    // le PDF avec logo embarque l'image : il est nettement plus volumineux que sans
    expect(avec.length).toBeGreaterThan(sans.length + 500);
  }, 60_000);
});

describe("Email — lien de l'aperçu", () => {
  test("un vrai lien à l'envoi", () => {
    expect(lienEmail("https://vertexone.cm/devis/abc", "Consulter")).toBe('<p><a href="https://vertexone.cm/devis/abc">Consulter</a></p>');
  });
  test("dans l'aperçu : aucun lien cliquable (jamais de href, qui rechargerait l'application dans le cadre)", () => {
    const html = lienEmail(null, "Consulter");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("href");
    expect(html).toContain("Consulter");
  });
});

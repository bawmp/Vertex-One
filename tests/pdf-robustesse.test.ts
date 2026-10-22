import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { logoUtilisablePourPDF } from "@/lib/pdf/donnees";
import { lienEmail } from "@/lib/email/lien";

describe("PDF — logo", () => {
  test("seuls le PNG et le JPEG sont transmis au PDF (SVG, WebP, GIF et inconnu : sans logo)", () => {
    expect(logoUtilisablePourPDF("image/png")).toBe(true);
    expect(logoUtilisablePourPDF("image/jpeg")).toBe(true);
    for (const autre of ["image/svg+xml", "image/webp", "image/gif", "", null, undefined]) {
      expect(logoUtilisablePourPDF(autre), String(autre)).toBe(false);
    }
  });
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

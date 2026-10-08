import { describe, test, expect } from "vitest";
import { construireEnteteLogo } from "@/lib/email/logo";

const base = { entrepriseId: "ent_123", nom: "Beau & Bon Traiteur", logoCleStockage: "ent_123/logo.png", logoTypeMime: "image/png" };

describe("En-tête de logo des emails envoyés au nom de l'entreprise", () => {
  test("un logo PNG, JPEG, GIF ou WebP donne une image servie par la route publique /logo/[entrepriseId]", () => {
    for (const mime of ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]) {
      const html = construireEnteteLogo({ ...base, logoTypeMime: mime }, "https://app.vertexone.cm");
      expect(html, mime).toContain('src="https://app.vertexone.cm/logo/ent_123"');
      expect(html).toContain("max-height:64px");
    }
  });

  test("un logo SVG est omis : les messageries ne l'affichent pas", () => {
    expect(construireEnteteLogo({ ...base, logoTypeMime: "image/svg+xml" }, "https://app.vertexone.cm")).toBe("");
  });

  test("sans logo (ou sans type connu), aucun en-tête : l'email reste inchangé", () => {
    expect(construireEnteteLogo({ ...base, logoCleStockage: null }, "https://app.vertexone.cm")).toBe("");
    expect(construireEnteteLogo({ ...base, logoTypeMime: null }, "https://app.vertexone.cm")).toBe("");
  });

  test("le nom de l'entreprise, saisi par un utilisateur, est échappé", () => {
    const html = construireEnteteLogo({ ...base, nom: '"><script>alert(1)</script>' }, "https://app.vertexone.cm");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("tolère une adresse de base terminée par une barre oblique et encode l'identifiant", () => {
    const html = construireEnteteLogo({ ...base, entrepriseId: "a b/c" }, "https://app.vertexone.cm/");
    expect(html).toContain('src="https://app.vertexone.cm/logo/a%20b%2Fc"');
  });
});

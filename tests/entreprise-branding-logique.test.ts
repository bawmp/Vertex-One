import { describe, test, expect } from "vitest";
import { schemaCouleur } from "@/lib/branding";

/**
 * Validation de la couleur de marque (échange du 2026-09-13) — logique pure,
 * pas de base de données requise. La couleur est injectée telle quelle dans
 * une valeur CSS (--primary) côté layout, donc un format autre qu'un hex
 * strict à 6 chiffres ne doit jamais être accepté.
 */
describe("Personnalisation — validation de la couleur de marque", () => {
  test("accepte un hex valide, minuscule ou majuscule", () => {
    expect(schemaCouleur.safeParse({ couleurMarque: "#0f766e" }).success).toBe(true);
    expect(schemaCouleur.safeParse({ couleurMarque: "#0F766E" }).success).toBe(true);
  });

  test("accepte un hex entouré d'espaces (trim)", () => {
    const analyse = schemaCouleur.safeParse({ couleurMarque: "  #0f766e  " });
    expect(analyse.success).toBe(true);
    if (analyse.success) expect(analyse.data.couleurMarque).toBe("#0f766e");
  });

  test("rejette un hex à 3 chiffres", () => {
    expect(schemaCouleur.safeParse({ couleurMarque: "#0fe" }).success).toBe(false);
  });

  test("rejette une valeur sans dièse", () => {
    expect(schemaCouleur.safeParse({ couleurMarque: "0f766e" }).success).toBe(false);
  });

  test("rejette un mot-clé CSS (pas un hex)", () => {
    expect(schemaCouleur.safeParse({ couleurMarque: "emerald" }).success).toBe(false);
  });

  test("rejette une chaîne vide", () => {
    expect(schemaCouleur.safeParse({ couleurMarque: "" }).success).toBe(false);
  });

  test("rejette une tentative d'injection CSS", () => {
    expect(schemaCouleur.safeParse({ couleurMarque: "#000000; background: url(evil.com)" }).success).toBe(false);
  });
});

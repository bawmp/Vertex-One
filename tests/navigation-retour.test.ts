import { describe, test, expect } from "vitest";
import { cheminRetourSur, libelleRetour } from "@/lib/navigation-retour";

describe("Chemin de retour", () => {
  test("accepte une page interne de l'application", () => {
    expect(cheminRetourSur("/app/facturation/devis/abc123")).toBe("/app/facturation/devis/abc123");
    expect(cheminRetourSur("/app/facturation/factures/xyz_9-8")).toBe("/app/facturation/factures/xyz_9-8");
  });

  test("refuse tout ce qui sort de l'application (redirection ouverte)", () => {
    for (const mauvais of [
      "https://exemple.com",
      "//exemple.com/app/x",
      "/app//exemple.com",
      "http://localhost/app/x",
      "javascript:alert(1)",
      "/autre/page",
      "/app/../admin",
      "/app/x" + String.fromCharCode(92) + "evil",
      "",
      undefined,
      null,
      "/app/" + "a".repeat(250),
    ]) {
      expect(cheminRetourSur(mauvais as string | undefined | null), String(mauvais)).toBeNull();
    }
  });

  test("le libellé dépend de la page d'origine", () => {
    expect(libelleRetour("/app/facturation/devis/1")).toBe("devis");
    expect(libelleRetour("/app/facturation/factures/1")).toBe("facture");
    expect(libelleRetour("/app/contacts/1")).toBe("page");
  });
});

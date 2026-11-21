import { describe, test, expect } from "vitest";
import { periodeDe, grouperParPeriode, factureCorrespond, devisCorrespond, compteDansTotal } from "@/lib/facturation/classement";

describe("classement par période", () => {
  test("mois, trimestre, semestre, année", () => {
    const d = "2026-08-15T10:00:00Z";
    expect(periodeDe(d, "MOIS").cle).toBe("2026-08");
    expect(periodeDe(d, "TRIMESTRE").cle).toBe("2026-T3");
    expect(periodeDe(d, "SEMESTRE").cle).toBe("2026-S2");
    expect(periodeDe(d, "ANNEE").cle).toBe("2026");
    expect(periodeDe("2026-03-10T10:00:00Z", "TRIMESTRE").cle).toBe("2026-T1");
    expect(periodeDe("2026-06-10T10:00:00Z", "SEMESTRE").cle).toBe("2026-S1");
  });

  test("le jour civil est celui de Douala (UTC+1) : le 30 juin à 23 h 30 UTC est déjà en juillet", () => {
    expect(periodeDe("2026-06-30T23:30:00Z", "MOIS").cle).toBe("2026-07");
    expect(periodeDe("2026-06-30T23:30:00Z", "SEMESTRE").cle).toBe("2026-S2");
    expect(periodeDe("2026-06-30T22:30:00Z", "MOIS").cle).toBe("2026-06");
  });

  test("les groupes sont du plus récent au plus ancien et gardent l'ordre des éléments", () => {
    const docs = [
      { n: "a", d: "2026-11-20T10:00:00Z" },
      { n: "b", d: "2026-11-02T10:00:00Z" },
      { n: "c", d: "2025-12-31T10:00:00Z" },
      { n: "d", d: "2026-01-05T10:00:00Z" },
    ];
    const mois = grouperParPeriode(docs, (x) => x.d, "MOIS");
    expect(mois.map((g) => g.periode.cle)).toEqual(["2026-11", "2026-01", "2025-12"]);
    expect(mois[0].elements.map((x) => x.n)).toEqual(["a", "b"]);
    expect(grouperParPeriode(docs, (x) => x.d, "ANNEE").map((g) => [g.periode.cle, g.elements.length])).toEqual([["2026", 3], ["2025", 1]]);
    expect(grouperParPeriode(docs, (x) => x.d, "SEMESTRE").map((g) => g.periode.cle)).toEqual(["2026-S2", "2026-S1", "2025-S2"]);
  });
});

describe("filtres de statut", () => {
  test("factures : non payées = émise + partielle + en retard ; en attente exclut le retard ; payées et annulées à part", () => {
    const statuts = ["EMISE", "PARTIELLEMENT_PAYEE", "EN_RETARD", "PAYEE", "ANNULEE"];
    expect(statuts.filter((s) => factureCorrespond(s, "NON_PAYEES"))).toEqual(["EMISE", "PARTIELLEMENT_PAYEE", "EN_RETARD"]);
    expect(statuts.filter((s) => factureCorrespond(s, "EN_ATTENTE"))).toEqual(["EMISE", "PARTIELLEMENT_PAYEE"]);
    expect(statuts.filter((s) => factureCorrespond(s, "EN_RETARD"))).toEqual(["EN_RETARD"]);
    expect(statuts.filter((s) => factureCorrespond(s, "PAYEES"))).toEqual(["PAYEE"]);
    expect(statuts.filter((s) => factureCorrespond(s, "ANNULEES"))).toEqual(["ANNULEE"]);
    expect(statuts.filter((s) => factureCorrespond(s, "TOUTES"))).toHaveLength(5);
  });

  test("devis : un devis envoyé dont la validité est passée est expiré, pas en attente", () => {
    const maintenant = new Date("2026-11-21T10:00:00Z");
    const valide = { statut: "ENVOYE", dateValidite: "2026-12-01T00:00:00Z" };
    const echu = { statut: "ENVOYE", dateValidite: "2026-11-01T00:00:00Z" };
    expect(devisCorrespond(valide, "EN_ATTENTE", maintenant)).toBe(true);
    expect(devisCorrespond(valide, "EXPIRE", maintenant)).toBe(false);
    expect(devisCorrespond(echu, "EN_ATTENTE", maintenant)).toBe(false);
    expect(devisCorrespond(echu, "EXPIRE", maintenant)).toBe(true);
    expect(devisCorrespond({ statut: "BROUILLON", dateValidite: "2026-01-01T00:00:00Z" }, "EXPIRE", maintenant)).toBe(false);
    expect(devisCorrespond({ statut: "ACCEPTE", dateValidite: "2026-01-01T00:00:00Z" }, "ACCEPTE", maintenant)).toBe(true);
    expect(devisCorrespond({ statut: "REFUSE", dateValidite: "2026-01-01T00:00:00Z" }, "TOUS", maintenant)).toBe(true);
  });

  test("une facture annulée et un devis refusé ne comptent pas dans le total d'une période", () => {
    expect(compteDansTotal("ANNULEE")).toBe(false);
    expect(compteDansTotal("REFUSE")).toBe(false);
    expect(compteDansTotal("PAYEE")).toBe(true);
    expect(compteDansTotal("BROUILLON")).toBe(true);
  });
});

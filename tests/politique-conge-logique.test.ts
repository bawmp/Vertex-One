import { describe, test, expect } from "vitest";
import { calculerDroitAnnuelConge } from "@/lib/rh/politique-conge";

describe("Politiques de congé — calculerDroitAnnuelConge()", () => {
  test("politique FIXE : renvoie toujours le même droit, quelle que soit l'ancienneté", () => {
    const politique = { type: "FIXE" as const, joursBaseParAn: 18 };
    expect(calculerDroitAnnuelConge(politique, [], new Date("2020-01-01"), new Date("2026-06-01"))).toBe(18);
    expect(calculerDroitAnnuelConge(politique, [], new Date("2026-01-01"), new Date("2026-06-01"))).toBe(18);
  });

  test("politique ANCIENNETE sans palier atteint : renvoie le droit de base", () => {
    const politique = { type: "ANCIENNETE" as const, joursBaseParAn: 18 };
    const paliers = [{ anneesAncienneteMin: 5, joursSupplementaires: 2 }];
    // Embauché il y a 2 ans seulement — palier de 5 ans pas encore atteint.
    expect(calculerDroitAnnuelConge(politique, paliers, new Date("2024-01-01"), new Date("2026-01-01"))).toBe(18);
  });

  test("politique ANCIENNETE : les paliers atteints s'additionnent au droit de base", () => {
    const politique = { type: "ANCIENNETE" as const, joursBaseParAn: 18 };
    const paliers = [
      { anneesAncienneteMin: 5, joursSupplementaires: 2 },
      { anneesAncienneteMin: 10, joursSupplementaires: 2 },
      { anneesAncienneteMin: 15, joursSupplementaires: 3 },
    ];
    // 12 ans d'ancienneté : palier 5 et palier 10 atteints, pas le palier 15.
    expect(calculerDroitAnnuelConge(politique, paliers, new Date("2014-01-01"), new Date("2026-01-01"))).toBe(18 + 2 + 2);
  });

  test("l'ancienneté ne compte que le jour anniversaire réellement passé", () => {
    const politique = { type: "ANCIENNETE" as const, joursBaseParAn: 18 };
    const paliers = [{ anneesAncienneteMin: 5, joursSupplementaires: 2 }];
    // Embauché le 10 juin 2021 — au 1er juin 2026, l'anniversaire des 5 ans
    // (10 juin 2026) n'est pas encore passé : le palier ne doit pas compter.
    expect(calculerDroitAnnuelConge(politique, paliers, new Date("2021-06-10"), new Date("2026-06-01"))).toBe(18);
    // Au 10 juin 2026 (jour même), le palier est atteint.
    expect(calculerDroitAnnuelConge(politique, paliers, new Date("2021-06-10"), new Date("2026-06-10"))).toBe(18 + 2);
  });

  test("une date de référence antérieure à l'embauche ne renvoie jamais une ancienneté négative", () => {
    const politique = { type: "ANCIENNETE" as const, joursBaseParAn: 18 };
    const paliers = [{ anneesAncienneteMin: 0, joursSupplementaires: 1 }];
    expect(calculerDroitAnnuelConge(politique, paliers, new Date("2027-01-01"), new Date("2026-01-01"))).toBe(18 + 1);
  });
});

import { describe, it, expect } from "vitest";
import { joursDeSemaine, semaineDuMois } from "@/lib/rh/presences-commun";

describe("fiche de présence hebdomadaire — règles pures", () => {
  it("la semaine va du lundi au dimanche, quel que soit le jour donné", () => {
    for (const jour of ["2026-11-02", "2026-11-04", "2026-11-08"]) {
      const j = joursDeSemaine(jour);
      expect(j[0]).toBe("2026-11-02");
      expect(j[6]).toBe("2026-11-08");
      expect(j).toHaveLength(7);
    }
  });
  it("traverse les fins de mois et d'année", () => {
    expect(joursDeSemaine("2026-11-01")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(joursDeSemaine("2026-12-31")[6]).toBe("2027-01-03");
  });
  it("une semaine à cheval compte pour le mois de son jeudi", () => {
    // 26 oct → 1 nov 2026 : jeudi 29 octobre → octobre, semaine 5
    expect(semaineDuMois("2026-11-01")).toEqual({ mois: 9, annee: 2026, numero: 5 });
    // 2 → 8 nov : jeudi 5 novembre → semaine 1 de novembre
    expect(semaineDuMois("2026-11-05")).toEqual({ mois: 10, annee: 2026, numero: 1 });
    expect(semaineDuMois("2026-11-30")).toEqual({ mois: 11, annee: 2026, numero: 1 }); // jeudi 3 décembre
  });
});

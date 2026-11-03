import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { compteComptable, ecritureComptable, entreprise } from "@/db/schema";
import { anneeExercice, debutExerciceTexte, finExerciceTexte, moisDebutValide, periodeExercice } from "@/lib/comptabilite/exercice-regles";
import { apercuCloture, definirMoisDebutExercice, exercicesConnus, lignesExerciceSansCloture, moisDebutExercice } from "@/lib/comptabilite/cloture";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Priorité 4.6 : exercice décalé (début un autre mois que janvier). */
describe("Exercice décalé — règles pures", () => {
  test("année civile par défaut, exercice décalé numéroté par son année de fin", () => {
    const civil = periodeExercice(2026)!;
    expect(civil.du.toISOString()).toBe("2025-12-31T23:00:00.000Z");
    expect(finExerciceTexte(2026)).toBe("31/12/2026");
    expect(debutExerciceTexte(2026, 7)).toBe("01/07/2025");
    expect(finExerciceTexte(2026, 7)).toBe("30/06/2026");
    expect(finExerciceTexte(2024, 3)).toBe("29/02/2024"); // exercice mars 2023 → février 2024, année bissextile
    expect(periodeExercice(2026, 13)).toBeNull();
    expect(periodeExercice(1999, 7)).toBeNull();
  });

  test("à quel exercice appartient une date", () => {
    expect(anneeExercice(2026, 3, 1)).toBe(2026);
    expect(anneeExercice(2025, 8, 7)).toBe(2026);
    expect(anneeExercice(2026, 6, 7)).toBe(2026);
    expect(anneeExercice(2026, 7, 7)).toBe(2027);
    expect(moisDebutValide(0)).toBe(false);
    expect(moisDebutValide(12)).toBe(true);
    expect(moisDebutValide(1.5)).toBe(false);
  });
});

describe("Exercice décalé — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nom = `TEST Decale ${suffixe}`;
  let E: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom, secteurProfil: "commerce" }).returning({ id: entreprise.id });
    E = e.id;
    await avecEntreprise(E, async (tx) => {
      const [c] = await tx.select({ id: compteComptable.id }).from(compteComptable).where(and(eq(compteComptable.numero, "706000"), isNull(compteComptable.entrepriseId)));
      const l = (date: string, credit: number) => ({ entrepriseId: E, dateEcriture: new Date(`${date}T10:00:00+01:00`), libelle: "Vente", compteId: c.id, debit: 0, credit });
      await tx.insert(ecritureComptable).values([l("2025-08-10", 1000), l("2026-03-10", 2000), l("2026-07-05", 4000)]);
    });
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nom);
  }, 60_000);

  test("année civile : trois dates, deux exercices (2025 et 2026)", async () => {
    expect(await avecEntreprise(E, (tx) => moisDebutExercice(tx, E))).toBe(1);
    const annees = await avecEntreprise(E, (tx) => exercicesConnus(tx, E, new Date("2026-08-01T00:00:00Z")));
    expect(annees).toEqual([2026, 2025]);
  }, 60_000);

  test("début en juillet : l'exercice 2026 va du 01/07/2025 au 30/06/2026 et la vente de juillet 2026 ouvre 2027", async () => {
    expect((await avecEntreprise(E, (tx) => definirMoisDebutExercice(tx, E, 7))).ok).toBe(true);
    const annees = await avecEntreprise(E, (tx) => exercicesConnus(tx, E, new Date("2026-08-01T00:00:00Z")));
    expect(annees).toEqual([2027, 2026]);
    const lignes2026 = await avecEntreprise(E, (tx) => lignesExerciceSansCloture(tx, E, 2026));
    expect(lignes2026.map((x) => x.credit).sort()).toEqual([1000, 2000]);
    const lignes2027 = await avecEntreprise(E, (tx) => lignesExerciceSansCloture(tx, E, 2027));
    expect(lignes2027.map((x) => x.credit)).toEqual([4000]);
    const ap = await avecEntreprise(E, (tx) => apercuCloture(tx, E, 2026, new Date("2026-05-01T00:00:00Z")));
    expect(ap?.obstacles).toContain("Cet exercice n'est pas terminé : on ne clôture qu'après son dernier jour.");
  }, 90_000);

  test("mois invalide refusé", async () => {
    expect((await avecEntreprise(E, (tx) => definirMoisDebutExercice(tx, E, 13))).ok).toBe(false);
    expect((await avecEntreprise(E, (tx) => definirMoisDebutExercice(tx, E, 0))).ok).toBe(false);
  }, 60_000);
});

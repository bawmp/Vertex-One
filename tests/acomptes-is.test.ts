import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur } from "@/db/schema";
import { acompteMensuelIS, bilanAcomptes, moisDeExercice, TYPE_ACOMPTE_IS } from "@/lib/comptabilite/declarations-regles";
import { listerDeclarations, listerDeclarationsTva, noterDeclarationTva } from "@/lib/comptabilite/declarations";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Acomptes d'impôt sur les sociétés : calcul mensuel, mois d'un exercice, bilan face à l'impôt estimé, suivi isolé de la TVA et des autres entreprises. */
describe("Acomptes d'impôt sur les sociétés — règles pures", () => {
  test("acompte du mois : taux × chiffre d'affaires HT, arrondi, jamais négatif", () => {
    expect(acompteMensuelIS(10_000_000, 2.2)).toBe(220_000);
    expect(acompteMensuelIS(1_234_567, 2.2)).toBe(27_160);
    expect(acompteMensuelIS(-500_000, 2.2)).toBe(0);
    expect(acompteMensuelIS(1_000_000, 0)).toBe(0);
  });

  test("les mois d'un exercice : année civile et exercice décalé (numéro = année de fin)", () => {
    expect(moisDeExercice(2026, 1)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]);
    const decale = moisDeExercice(2026, 7);
    expect(decale[0]).toBe("2025-07");
    expect(decale[5]).toBe("2025-12");
    expect(decale[6]).toBe("2026-01");
    expect(decale[11]).toBe("2026-06");
  });

  test("bilan : seuls les acomptes payés sont versés ; l'excédent devient un crédit, jamais un solde négatif", () => {
    const liste = [
      { statut: "PAYEE", montant: 400_000 },
      { statut: "PAYEE", montant: 300_000 },
      { statut: "DECLAREE", montant: 200_000 },
      { statut: "A_FAIRE", montant: 999_999 },
    ];
    expect(bilanAcomptes(1_000_000, liste)).toEqual({ verses: 700_000, enAttente: 200_000, soldeAPayer: 300_000, creditAImputer: 0 });
    expect(bilanAcomptes(500_000, liste)).toEqual({ verses: 700_000, enAttente: 200_000, soldeAPayer: 0, creditAImputer: 200_000 });
    expect(bilanAcomptes(0, [])).toEqual({ verses: 0, enAttente: 0, soldeAPayer: 0, creditAImputer: 0 });
  });
});

describe("Acomptes d'impôt sur les sociétés — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Acompte A ${suffixe}`;
  const nomB = `TEST Acompte B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let uB: string;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce" }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [x] = await db.insert(utilisateur).values({ entrepriseId: A, email: `acompte-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [y] = await db.insert(utilisateur).values({ entrepriseId: B, email: `acompte-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = x.id;
    uB = y.id;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 60_000);

  test("un acompte et la TVA du même mois sont deux suivis distincts ; l'échéance est recalculée côté serveur", async () => {
    expect((await avecEntreprise(A, (tx) => noterDeclarationTva(tx, A, uA, { periode: "2026-03", statut: "PAYEE", montant: 111, reference: "TVA" }))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => noterDeclarationTva(tx, A, uA, { periode: "2026-03", statut: "DECLAREE", montant: 222_000, reference: "AC 1" }, "ACOMPTE_IS"))).ok).toBe(true);
    const acomptes = await avecEntreprise(A, (tx) => listerDeclarations(tx, A, TYPE_ACOMPTE_IS));
    const tva = await avecEntreprise(A, (tx) => listerDeclarationsTva(tx, A));
    expect(acomptes.get("2026-03")).toMatchObject({ statut: "DECLAREE", montant: 222_000, reference: "AC 1", echeance: "2026-04-15" });
    expect(tva.get("2026-03")).toMatchObject({ statut: "PAYEE", montant: 111 });
    // Mettre à jour le même mois ne crée pas de seconde ligne.
    await avecEntreprise(A, (tx) => noterDeclarationTva(tx, A, uA, { periode: "2026-03", statut: "PAYEE", montant: 222_000, reference: "AC 1" }, "ACOMPTE_IS"));
    expect((await avecEntreprise(A, (tx) => listerDeclarations(tx, A, TYPE_ACOMPTE_IS))).size).toBe(1);
    expect((await avecEntreprise(A, (tx) => noterDeclarationTva(tx, A, uA, { periode: "2026-13", statut: "DECLAREE", montant: null, reference: "" }, "ACOMPTE_IS"))).ok).toBe(false);
  }, 90_000);

  test("fuite : une autre entreprise ne voit pas les acomptes de la première", async () => {
    expect((await avecEntreprise(B, (tx) => listerDeclarations(tx, B, TYPE_ACOMPTE_IS))).size).toBe(0);
    await avecEntreprise(B, (tx) => noterDeclarationTva(tx, B, uB, { periode: "2026-03", statut: "PAYEE", montant: 1, reference: "B" }, "ACOMPTE_IS"));
    const a = await avecEntreprise(A, (tx) => listerDeclarations(tx, A, TYPE_ACOMPTE_IS));
    expect(a.get("2026-03")?.reference).toBe("AC 1");
  }, 60_000);
});

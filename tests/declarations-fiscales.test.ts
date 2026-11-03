import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur } from "@/db/schema";
import { echeanceTva, estimerIS, lirePourcentage, moisEcoules, periodeMoisValide, statutAffiche } from "@/lib/comptabilite/declarations-regles";
import { listerDeclarationsTva, noterDeclarationTva } from "@/lib/comptabilite/declarations";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Priorité 4.8 : suivi des déclarations de TVA et estimation indicative de l'impôt sur les sociétés (pas de télédéclaration). */
describe("Déclarations fiscales — règles pures", () => {
  test("échéance de la TVA : le 15 du mois suivant, décembre passe à janvier", () => {
    expect(echeanceTva("2026-03")).toBe("2026-04-15");
    expect(echeanceTva("2026-12")).toBe("2027-01-15");
    expect(echeanceTva("2026-13")).toBeNull();
    expect(echeanceTva("2026-3")).toBeNull();
    expect(periodeMoisValide("2026-00")).toBe(false);
  });

  test("les mois écoulés : le mois en cours n'est pas compté, passage d'année", () => {
    expect(moisEcoules("2026-03-10", 4)).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
    expect(moisEcoules("2026-01-01", 1)).toEqual(["2025-12"]);
  });

  test("statut affiché : en retard seulement si non déclarée après l'échéance", () => {
    expect(statutAffiche("A_FAIRE", "2026-04-15", "2026-04-15")).toBe("A_FAIRE");
    expect(statutAffiche("A_FAIRE", "2026-04-15", "2026-04-16")).toBe("EN_RETARD");
    expect(statutAffiche("DECLAREE", "2026-04-15", "2027-01-01")).toBe("DECLAREE");
    expect(statutAffiche("PAYEE", "2026-04-15", "2027-01-01")).toBe("PAYEE");
  });

  test("estimation de l'impôt : taux sur le résultat, minimum sur le chiffre d'affaires, le plus élevé gagne", () => {
    expect(estimerIS({ resultat: 10_000_000, chiffreAffaires: 100_000_000, tauxPourcent: 33, minimumPourcent: 2 })).toEqual({ impotSurResultat: 3_300_000, minimum: 2_000_000, impot: 3_300_000, minimumApplique: false });
    expect(estimerIS({ resultat: 1_000_000, chiffreAffaires: 100_000_000, tauxPourcent: 33, minimumPourcent: 2 })).toMatchObject({ impot: 2_000_000, minimumApplique: true });
    expect(estimerIS({ resultat: -5_000_000, chiffreAffaires: 50_000_000, tauxPourcent: 33, minimumPourcent: 2 })).toMatchObject({ impotSurResultat: 0, impot: 1_000_000 });
    expect(estimerIS({ resultat: 0, chiffreAffaires: 0, tauxPourcent: 33, minimumPourcent: 2 }).impot).toBe(0);
  });

  test("lecture d'un pourcentage", () => {
    expect(lirePourcentage("33")).toBe(33);
    expect(lirePourcentage("33,5")).toBe(33.5);
    expect(lirePourcentage("101")).toBeNull();
    expect(lirePourcentage("-1")).toBeNull();
    expect(lirePourcentage("abc")).toBeNull();
  });
});

describe("Déclarations fiscales — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Declar A ${suffixe}`;
  const nomB = `TEST Declar B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let uB: string;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce" }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [x] = await db.insert(utilisateur).values({ entrepriseId: A, email: `decl-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [y] = await db.insert(utilisateur).values({ entrepriseId: B, email: `decl-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = x.id;
    uB = y.id;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 60_000);

  test("noter, mettre à jour le même mois, refuser une saisie invalide ; l'échéance est recalculée par le serveur", async () => {
    expect((await avecEntreprise(A, (tx) => noterDeclarationTva(tx, A, uA, { periode: "2026-03", statut: "DECLAREE", montant: 150_000, reference: "  REC  123 " }))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => noterDeclarationTva(tx, A, uA, { periode: "2026-03", statut: "PAYEE", montant: 150_000, reference: "REC 123" }))).ok).toBe(true);
    const liste = await avecEntreprise(A, (tx) => listerDeclarationsTva(tx, A));
    expect(liste.size).toBe(1);
    expect(liste.get("2026-03")).toMatchObject({ statut: "PAYEE", montant: 150_000, reference: "REC 123", echeance: "2026-04-15" });
    expect(liste.get("2026-03")?.declareeLe).toBeInstanceOf(Date);
    expect((await avecEntreprise(A, (tx) => noterDeclarationTva(tx, A, uA, { periode: "2026-13", statut: "DECLAREE", montant: null, reference: "" }))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => noterDeclarationTva(tx, A, uA, { periode: "2026-04", statut: "BIDON", montant: null, reference: "" }))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => noterDeclarationTva(tx, A, uA, { periode: "2026-04", statut: "DECLAREE", montant: -5, reference: "" }))).ok).toBe(false);
    // Remettre « à faire » efface la date de déclaration.
    await avecEntreprise(A, (tx) => noterDeclarationTva(tx, A, uA, { periode: "2026-03", statut: "A_FAIRE", montant: null, reference: "" }));
    expect((await avecEntreprise(A, (tx) => listerDeclarationsTva(tx, A))).get("2026-03")?.declareeLe).toBeNull();
  }, 90_000);

  test("fuite : une autre entreprise ne voit pas le suivi de la première et ne l'écrase pas", async () => {
    expect((await avecEntreprise(B, (tx) => listerDeclarationsTva(tx, B))).size).toBe(0);
    expect((await avecEntreprise(B, (tx) => noterDeclarationTva(tx, B, uB, { periode: "2026-03", statut: "PAYEE", montant: 1, reference: "B" }))).ok).toBe(true);
    const a = await avecEntreprise(A, (tx) => listerDeclarationsTva(tx, A));
    expect(a.get("2026-03")?.statut).toBe("A_FAIRE");
    expect(a.get("2026-03")?.reference).toBeNull();
  }, 60_000);
});

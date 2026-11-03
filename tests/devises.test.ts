import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { db, avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { convertirDepuisXaf, convertirVersXaf, dateJourValide, deviseValide, formaterTaux, lireTaux, tauxEnVigueur } from "@/lib/devises/regles";
import { enregistrerTaux, listerTaux, supprimerTaux } from "@/lib/devises/taux";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Priorité 4.7 : taux de change et équivalents (la comptabilité reste en FCFA). */
describe("Devises — règles pures", () => {
  test("lecture du taux : virgule ou point, trois décimales au plus, positif", () => {
    expect(lireTaux("655,957")).toBe(655957);
    expect(lireTaux("655.957")).toBe(655957);
    expect(lireTaux(" 600 ")).toBe(600000);
    expect(lireTaux("0")).toBeNull();
    expect(lireTaux("-5")).toBeNull();
    expect(lireTaux("1,2345")).toBeNull();
    expect(lireTaux("abc")).toBeNull();
    expect(lireTaux("")).toBeNull();
  });

  test("conversions : euro à 655,957 ; aller-retour sans dérive notable", () => {
    expect(convertirDepuisXaf(655_957, 655_957)).toBe(1000);
    expect(convertirDepuisXaf(100_000, 655_957)).toBe(152.45);
    expect(convertirVersXaf(152.45, 655_957)).toBe(100_001);
    expect(convertirVersXaf(1, 655_957)).toBe(656);
    expect(formaterTaux(655_957)).toMatch(/655,957/);
  });

  test("devise : trois lettres, jamais le FCFA ; date réelle", () => {
    expect(deviseValide("EUR")).toBe(true);
    expect(deviseValide("XAF")).toBe(false);
    expect(deviseValide("eur")).toBe(false);
    expect(deviseValide("EURO")).toBe(false);
    expect(dateJourValide("2026-02-31")).toBe(false);
    expect(dateJourValide("2026-02-28")).toBe(true);
  });

  test("taux en vigueur : le plus récent à la date, rien avant le premier", () => {
    const l = [
      { id: "1", devise: "USD", tauxMilliemes: 600_000, dateEffet: "2026-01-01" },
      { id: "2", devise: "USD", tauxMilliemes: 620_000, dateEffet: "2026-06-01" },
      { id: "3", devise: "EUR", tauxMilliemes: 655_957, dateEffet: "2026-01-01" },
    ];
    expect(tauxEnVigueur(l, "USD", "2026-03-15")?.id).toBe("1");
    expect(tauxEnVigueur(l, "USD", "2026-06-01")?.id).toBe("2");
    expect(tauxEnVigueur(l, "USD", "2025-12-31")).toBeNull();
    expect(tauxEnVigueur(l, "GBP", "2026-03-15")).toBeNull();
  });
});

describe("Devises — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Devises A ${suffixe}`;
  const nomB = `TEST Devises B ${suffixe}`;
  let A: string;
  let B: string;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce" }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 60_000);

  test("enregistrer, corriger le même jour, refuser une saisie invalide", async () => {
    expect((await avecEntreprise(A, (tx) => enregistrerTaux(tx, A, { devise: "eur", taux: "655,957", dateEffet: "2026-01-01" }))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => enregistrerTaux(tx, A, { devise: "EUR", taux: "656", dateEffet: "2026-01-01" }))).ok).toBe(true);
    const liste = await avecEntreprise(A, (tx) => listerTaux(tx, A));
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ devise: "EUR", tauxMilliemes: 656_000 });
    expect((await avecEntreprise(A, (tx) => enregistrerTaux(tx, A, { devise: "XAF", taux: "1", dateEffet: "2026-01-01" }))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => enregistrerTaux(tx, A, { devise: "USD", taux: "x", dateEffet: "2026-01-01" }))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => enregistrerTaux(tx, A, { devise: "USD", taux: "600", dateEffet: "2026-13-01" }))).ok).toBe(false);
  }, 60_000);

  test("fuite : une autre entreprise ne voit ni ne supprime les taux de la première", async () => {
    const [x] = await avecEntreprise(A, (tx) => listerTaux(tx, A));
    expect(await avecEntreprise(B, (tx) => listerTaux(tx, B))).toEqual([]);
    expect((await avecEntreprise(B, (tx) => supprimerTaux(tx, B, x.id))).ok).toBe(false);
    expect(await avecEntreprise(A, (tx) => listerTaux(tx, A))).toHaveLength(1);
    // Le même taux reste libre chez B.
    expect((await avecEntreprise(B, (tx) => enregistrerTaux(tx, B, { devise: "EUR", taux: "655,957", dateEffet: "2026-01-01" }))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => supprimerTaux(tx, A, x.id))).ok).toBe(true);
  }, 60_000);
});

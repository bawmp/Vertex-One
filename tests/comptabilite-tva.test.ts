import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { compteComptable, ecritureComptable, entreprise } from "@/db/schema";
import { dateDouala, periodePredefinie } from "@/lib/comptabilite/livres";
import { calculerTva, csvTva, lireDeclarationTva } from "@/lib/comptabilite/tva";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

describe("TVA — règle pure", () => {
  test("TVA à payer quand la collectée dépasse la déductible", () => {
    expect(calculerTva(1925, 385)).toEqual({ aPayer: 1540, creditAReporter: 0 });
  });
  test("crédit de TVA à reporter quand la déductible dépasse la collectée", () => {
    expect(calculerTva(100, 400)).toEqual({ aPayer: 0, creditAReporter: 300 });
  });
  test("le crédit de la période précédente vient en déduction ; un report négatif est ignoré", () => {
    expect(calculerTva(1000, 200, 500)).toEqual({ aPayer: 300, creditAReporter: 0 });
    expect(calculerTva(1000, 200, 1500)).toEqual({ aPayer: 0, creditAReporter: 700 });
    expect(calculerTva(1000, 200, -50)).toEqual({ aPayer: 800, creditAReporter: 0 });
  });
  test("mois dernier, y compris en janvier", () => {
    expect(periodePredefinie("mois-dernier", new Date("2026-11-02T10:00:00Z"))).toEqual({ du: "2026-10-01", au: "2026-10-31" });
    expect(periodePredefinie("mois-dernier", new Date("2026-01-05T10:00:00Z"))).toEqual({ du: "2025-12-01", au: "2025-12-31" });
  });
});

describe("TVA — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST TVA A ${suffixe}`;
  const nomB = `TEST TVA B ${suffixe}`;
  let entrepriseA: string;
  let entrepriseB: string;
  const periode = { du: dateDouala("2026-03-01", false)!, au: dateDouala("2026-03-31", true)! };

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseA = a.id;
    entrepriseB = b.id;
    const lignes = await db.select({ id: compteComptable.id, numero: compteComptable.numero }).from(compteComptable).where(inArray(compteComptable.numero, ["411000", "443200", "445200", "706000", "601000"]));
    const c = Object.fromEntries(lignes.map((l) => [l.numero, l.id]));
    const e = (compte: string, debit: number, credit: number, date: string, libelle: string) => ({ entrepriseId: entrepriseA, dateEcriture: new Date(date), libelle, compteId: c[compte], debit, credit });
    await avecEntreprise(entrepriseA, (tx) =>
      tx.insert(ecritureComptable).values([
        // Dans la période : vente 10 000 HT + 1 925 de TVA, achat 2 000 HT + 385 de TVA, avoir de 385 sur la vente.
        e("706000", 0, 10000, "2026-03-10T10:00:00Z", "Facture F1"),
        e("443200", 0, 1925, "2026-03-10T10:00:00Z", "TVA F1"),
        e("445200", 385, 0, "2026-03-12T10:00:00Z", "TVA récupérable — achat"),
        e("601000", 2000, 0, "2026-03-12T10:00:00Z", "Achat"),
        e("443200", 385, 0, "2026-03-20T10:00:00Z", "TVA avoir"),
        e("706000", 2000, 0, "2026-03-20T10:00:00Z", "Avoir"),
        // Hors période : veille (31/03 23 h 30 UTC = 01/04 00 h 30 à Douala) et février.
        e("443200", 0, 777, "2026-03-31T23:30:00Z", "TVA hors période (avril à Douala)"),
        e("443200", 0, 555, "2026-02-27T10:00:00Z", "TVA février"),
      ])
    );
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  test("collectée nette des annulations, déductible, chiffre d'affaires hors taxe, bornes de la période", async () => {
    const d = await avecEntreprise(entrepriseA, (tx) => lireDeclarationTva(tx, entrepriseA, periode));
    expect(d.tvaCollectee).toBe(1925 - 385);
    expect(d.tvaDeductible).toBe(385);
    expect(d.caHT).toBe(10000 - 2000);
    expect(d.collectee).toHaveLength(2);
    expect(d.deductible).toHaveLength(1);
    expect(d.collectee.some((l) => l.libelle.includes("hors période"))).toBe(false);
    expect(calculerTva(d.tvaCollectee, d.tvaDeductible)).toEqual({ aPayer: 1155, creditAReporter: 0 });
  });

  test("le CSV contient la synthèse puis le détail", async () => {
    const d = await avecEntreprise(entrepriseA, (tx) => lireDeclarationTva(tx, entrepriseA, periode));
    const csv = csvTva(d, calculerTva(d.tvaCollectee, d.tvaDeductible, 100), 100);
    expect(csv.lignes.filter((l) => l[0] === "SYNTHESE")).toHaveLength(6);
    expect(csv.lignes.find((l) => l[2] === "TVA à payer")?.[3]).toBe("1055");
    expect(csv.lignes.filter((l) => l[0] === "TVA COLLECTEE")).toHaveLength(2);
  });

  test("fuite entre entreprises : B ne voit aucune TVA de A", async () => {
    const d = await avecEntreprise(entrepriseB, (tx) => lireDeclarationTva(tx, entrepriseB, periode));
    expect(d).toMatchObject({ caHT: 0, tvaCollectee: 0, tvaDeductible: 0 });
    const forge = await avecEntreprise(entrepriseB, (tx) => lireDeclarationTva(tx, entrepriseA, periode));
    expect(forge.tvaCollectee).toBe(0);
  });
});

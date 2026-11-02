import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { db, avecEntreprise } from "@/db/client";
import { compteComptable, ecritureComptable, entreprise, utilisateur } from "@/db/schema";
import { construireBilan, construireCompteDeResultat } from "@/lib/comptabilite/etats-syscohada";
import { lireEtatsFinanciers } from "@/lib/comptabilite/etats-donnees";
import { cloturerExercice } from "@/lib/comptabilite/cloture";
import { EtatsFinanciersPDF } from "@/lib/pdf/etats-financiers";
import type { LigneBalance } from "@/lib/comptabilite/etats-financiers";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

const b = (numero: string, solde: number, libelle = `Compte ${numero}`): LigneBalance => ({ numero, libelle, classe: Number(numero[0]), debit: Math.max(solde, 0), credit: Math.max(-solde, 0), solde });

describe("États SYSCOHADA — bilan (règles pures)", () => {
  test("actif en brut / amortissements / net, passif, résultat de l'exercice, total actif = total passif", () => {
    const balance = [
      b("101000", -100000), // capital
      b("244000", 60000), // matériel
      b("284000", -20000), // amortissements du matériel
      b("311000", 15000), // stock
      b("411000", 30000), // clients
      b("401000", -12000), // fournisseurs
      b("443200", -5000), // TVA collectée
      b("512000", 40000), // banque
      b("706000", -50000), // produits
      b("601000", 20000), // charges
    ];
    // Actif net : 40 000 + 15 000 + 30 000 + 40 000 = 125 000 ; passif : 100 000 + 12 000 + 5 000 + résultat 30 000 = 147 000 → déséquilibré volontairement ici.
    const bilan = construireBilan(balance);
    const corp = bilan.actif.flatMap((s) => s.lignes).find((l) => l.code === "AI")!;
    expect(corp).toMatchObject({ brut: 60000, amort: 20000, net: 40000 });
    expect(bilan.passif.flatMap((s) => s.lignes).find((l) => l.code === "CJ")?.net).toBe(30000);
    expect(bilan.totalActif).toBe(125000);
    expect(bilan.totalPassif).toBe(147000);
    expect(bilan.equilibre).toBe(false);
  });

  test("une comptabilité équilibrée donne un bilan équilibré, y compris avec des soldes à rebours", () => {
    // Écritures cohérentes : somme des soldes = 0.
    const balance = [
      b("101000", -50000),
      b("411000", -3000), // client créditeur (à rebours) : va au passif
      b("401000", 2000), // fournisseur débiteur (à rebours) : va à l'actif
      b("512000", 41000),
      b("706000", -10000),
      b("601000", 20000),
    ];
    expect(balance.reduce((s, l) => s + l.solde, 0)).toBe(0);
    const bilan = construireBilan(balance);
    expect(bilan.equilibre).toBe(true);
    expect(bilan.totalActif).toBe(bilan.totalPassif);
    // Le résultat est une perte : négatif au passif.
    expect(bilan.passif.flatMap((s) => s.lignes).find((l) => l.code === "CJ")?.net).toBe(-10000);
  });

  test("après une clôture, le résultat vit dans 120000 et les comptes de gestion sont à zéro", () => {
    const bilan = construireBilan([b("101000", -50000), b("120000", -6000), b("512000", 56000)]);
    expect(bilan.equilibre).toBe(true);
    expect(bilan.passif.flatMap((s) => s.lignes).find((l) => l.code === "CJ")?.net).toBe(6000);
  });
});

describe("États SYSCOHADA — compte de résultat (règles pures)", () => {
  test("soldes intermédiaires : marge commerciale, valeur ajoutée, EBE, résultat d'exploitation, financier, net", () => {
    const cr = construireCompteDeResultat([
      b("707000", -100000), // ventes de marchandises
      b("601000", 60000), // achats de marchandises
      b("603000", -5000), // variation de stock (stock en hausse : réduit la charge)
      b("706000", -30000), // prestations
      b("605000", 8000), // autres achats
      b("622000", 12000), // services extérieurs
      b("641000", 20000), // personnel
      b("681000", 4000), // dotations
      b("776000", -2000), // produit financier
      b("661000", 1000), // charge financière
    ]);
    const code = (c: string) => cr.lignes.find((l) => l.code === c)?.montant;
    expect(code("XA")).toBe(100000 - 60000 + 5000); // 45 000
    expect(code("XB")).toBe(130000);
    expect(code("XC")).toBe(45000 + 30000 - 8000 - 12000); // 55 000
    expect(code("XD")).toBe(55000 - 20000); // 35 000
    expect(code("XE")).toBe(35000 - 4000); // 31 000
    expect(code("XF")).toBe(1000);
    expect(code("XG")).toBe(32000);
    expect(cr.resultatNet).toBe(32000);
    expect(cr.chiffreAffaires).toBe(130000);
  });

  test("identité : le résultat net égale toujours moins la somme des comptes 6, 7 et 8, comptes inconnus et HAO compris", () => {
    const comptes = [b("706000", -7000), b("628000", 2500), b("659000", 300), b("758000", -400), b("781000", -50), b("811000", 900), b("821000", -1200), b("709999", -75)];
    const cr = construireCompteDeResultat(comptes);
    expect(cr.resultatNet).toBe(-comptes.reduce((s, l) => s + l.solde, 0));
  });

  test("une entreprise de services n'a pas de lignes de marchandises", () => {
    const cr = construireCompteDeResultat([b("706000", -10000), b("622000", 3000)]);
    expect(cr.lignes.map((l) => l.code)).not.toContain("TA");
    expect(cr.lignes.map((l) => l.code)).toContain("XB");
    expect(cr.resultatNet).toBe(7000);
  });
});

describe("États SYSCOHADA — base réelle et PDF", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Etats A ${suffixe}`;
  const nomB = `TEST Etats B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  const c: Record<string, string> = {};

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence", niu: "M012600000010A" }).returning({ id: entreprise.id });
    const [bb] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    A = a.id;
    B = bb.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: A, email: `etats-a-${suffixe}@vertexone.test`, nomComplet: "Admin Etats A", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = ua.id;
    const rows = await db.select({ id: compteComptable.id, numero: compteComptable.numero }).from(compteComptable).where(inArray(compteComptable.numero, ["101000", "411000", "512000", "601000", "706000", "443200", "244000", "284000"]));
    for (const r of rows) c[r.numero] = r.id;
    const ec = (compte: string, debit: number, credit: number, date: string, libelle: string) => ({ entrepriseId: A, dateEcriture: new Date(date), libelle, compteId: c[compte], debit, credit });
    await avecEntreprise(A, (tx) =>
      tx.insert(ecritureComptable).values([
        ec("512000", 500000, 0, "2023-01-05T10:00:00Z", "Capital versé"),
        ec("101000", 0, 500000, "2023-01-05T10:00:00Z", "Capital versé"),
        ec("244000", 120000, 0, "2023-02-01T10:00:00Z", "Achat de matériel"),
        ec("512000", 0, 120000, "2023-02-01T10:00:00Z", "Achat de matériel"),
        ec("284000", 0, 24000, "2023-12-31T10:00:00Z", "Amortissement"),
        ec("601000", 24000, 0, "2023-12-31T10:00:00Z", "Dotation (compte de charge de test)"),
        ec("411000", 119250, 0, "2023-06-10T10:00:00Z", "Facture"),
        ec("706000", 0, 100000, "2023-06-10T10:00:00Z", "Facture"),
        ec("443200", 0, 19250, "2023-06-10T10:00:00Z", "TVA"),
      ])
    );
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  test("états d'un exercice ouvert : bilan équilibré, résultat lu dans le compte de résultat", async () => {
    const e = await avecEntreprise(A, (tx) => lireEtatsFinanciers(tx, A, 2023));
    expect(e).not.toBeNull();
    expect(e!.bilan.equilibre).toBe(true);
    expect(e!.resultat.chiffreAffaires).toBe(100000);
    expect(e!.resultat.resultatNet).toBe(100000 - 24000);
    const corp = e!.bilan.actif.flatMap((s) => s.lignes).find((l) => l.code === "AI")!;
    expect(corp).toMatchObject({ brut: 120000, amort: 24000, net: 96000 });
  });

  test("après la clôture, le résultat reste lisible, le bilan reste équilibré, le PDF se génère", async () => {
    const [u] = [{ id: uA }];
    expect((await avecEntreprise(A, (tx) => cloturerExercice(tx, A, u.id, 2023, new Date("2026-11-02T10:00:00Z")))).ok).toBe(true);
    const e = await avecEntreprise(A, (tx) => lireEtatsFinanciers(tx, A, 2023));
    expect(e!.resultat.resultatNet).toBe(76000); // le compte de résultat ignore l'écriture de clôture
    expect(e!.bilan.equilibre).toBe(true);
    expect(e!.bilan.passif.flatMap((s) => s.lignes).find((l) => l.code === "CJ")?.net).toBe(76000); // maintenant porté par le compte 120000

    const pdf = await renderToBuffer(createElement(EtatsFinanciersPDF, { etats: e!, genereLe: new Date("2026-11-02T10:00:00Z") }) as Parameters<typeof renderToBuffer>[0]);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  }, 60_000);

  test("fuite entre entreprises : B ne voit rien de A, exercice invalide refusé", async () => {
    const e = await avecEntreprise(B, (tx) => lireEtatsFinanciers(tx, B, 2023));
    expect(e!.bilan.actif).toEqual([]);
    expect(e!.bilan.passif).toEqual([]);
    expect(e!.resultat.lignes).toEqual([]);
    expect(await avecEntreprise(B, (tx) => lireEtatsFinanciers(tx, B, 1990))).toBeNull();
  });
});

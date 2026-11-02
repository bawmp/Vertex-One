import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { clotureExercice, compteComptable, ecritureComptable, entreprise, journalManuel, utilisateur } from "@/db/schema";
import { apercuCloture, calculerPlanCloture, cloturerExercice, periodeExercice } from "@/lib/comptabilite/cloture";
import { construireDossierExpert } from "@/lib/comptabilite/dossier-expert";
import { calculerBalance, type LigneBalance } from "@/lib/comptabilite/etats-financiers";
import { creerZip, crc32 } from "@/lib/export/zip";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

const ligne = (numero: string, classe: number, solde: number): LigneBalance => ({ numero, libelle: `Compte ${numero}`, classe, debit: Math.max(solde, 0), credit: Math.max(-solde, 0), solde });

describe("Clôture — règle pure", () => {
  test("bénéfice : les produits et charges sont soldés, le résultat va au crédit du 120000", () => {
    const plan = calculerPlanCloture([ligne("411000", 4, 5000), ligne("601000", 6, 4000), ligne("706000", 7, -10000)]);
    expect(plan.resultatNet).toBe(6000);
    expect(plan.lignes).toEqual([
      { numero: "601000", libelle: "Compte 601000", debit: 0, credit: 4000 },
      { numero: "706000", libelle: "Compte 706000", debit: 10000, credit: 0 },
      { numero: "120000", libelle: "Résultat net de l'exercice (bénéfice)", debit: 0, credit: 6000 },
    ]);
  });
  test("perte : le résultat va au débit du 129000 ; comptes de bilan et soldes nuls ignorés ; toujours équilibré", () => {
    const plan = calculerPlanCloture([ligne("512000", 5, 900), ligne("601000", 6, 7000), ligne("605000", 6, 0), ligne("706000", 7, -2000)]);
    expect(plan.resultatNet).toBe(-5000);
    expect(plan.lignes.some((l) => l.numero === "512000" || l.numero === "605000")).toBe(false);
    expect(plan.lignes.at(-1)).toMatchObject({ numero: "129000", debit: 5000, credit: 0 });
    expect(plan.lignes.reduce((s, l) => s + l.debit, 0)).toBe(plan.lignes.reduce((s, l) => s + l.credit, 0));
  });
  test("rien à solder", () => {
    expect(calculerPlanCloture([ligne("411000", 4, 100)]).lignes).toEqual([]);
  });
  test("période d'un exercice : 1er janvier au 31 décembre à Douala, année invalide refusée", () => {
    const p = periodeExercice(2026)!;
    expect(p.du.toISOString()).toBe("2025-12-31T23:00:00.000Z");
    expect(p.au.toISOString()).toBe("2026-12-31T22:59:59.999Z");
    expect(periodeExercice(1999)).toBeNull();
    expect(periodeExercice(2026.5)).toBeNull();
  });
});

describe("ZIP — structure", () => {
  test("une archive lisible : entêtes, noms UTF-8, contenus et sommes de contrôle", () => {
    const zip = creerZip([
      { nom: "a.csv", contenu: "x;y\r\n1;2\r\n" },
      { nom: "é/noté.txt", contenu: "bonjour" },
    ]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const fin = zip.readUInt32LE(zip.length - 22);
    expect(fin).toBe(0x06054b50);
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(2);
    const debutCentrale = zip.readUInt32LE(zip.length - 22 + 16);
    expect(zip.readUInt32LE(debutCentrale)).toBe(0x02014b50);
    const tailleNom = zip.readUInt16LE(26);
    expect(tailleNom).toBe(5);
    expect(zip.subarray(30, 35).toString("utf8")).toBe("a.csv");
    expect(zip.readUInt32LE(14)).toBe(crc32(Buffer.from("x;y\r\n1;2\r\n")));
    expect(zip.includes(Buffer.from("é/noté.txt", "utf8"))).toBe(true);
  });
  test("somme de contrôle connue", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });
});

describe("Clôture — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Cloture A ${suffixe}`;
  const nomB = `TEST Cloture B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let uB: string;
  let c: Record<string, string> = {};

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: A, email: `cloture-a-${suffixe}@vertexone.test`, nomComplet: "Admin Cloture A", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [ub] = await db.insert(utilisateur).values({ entrepriseId: B, email: `cloture-b-${suffixe}@vertexone.test`, nomComplet: "Admin Cloture B", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = ua.id;
    uB = ub.id;
    const comptes = await db.select({ id: compteComptable.id, numero: compteComptable.numero }).from(compteComptable).where(inArray(compteComptable.numero, ["411000", "512000", "601000", "706000", "120000", "129000"]));
    c = Object.fromEntries(comptes.map((x) => [x.numero, x.id]));
    expect(Object.keys(c)).toHaveLength(6);

    const e = (compte: string, debit: number, credit: number, date: string, libelle: string) => ({ entrepriseId: A, dateEcriture: new Date(date), libelle, compteId: c[compte], debit, credit });
    await avecEntreprise(A, (tx) =>
      tx.insert(ecritureComptable).values([
        // Exercice 2023 : 10 000 de ventes, 4 000 d'achats → bénéfice 6 000.
        e("411000", 10000, 0, "2023-06-10T10:00:00Z", "Facture 2023"),
        e("706000", 0, 10000, "2023-06-10T10:00:00Z", "Facture 2023"),
        e("601000", 4000, 0, "2023-07-10T10:00:00Z", "Achat 2023"),
        e("512000", 0, 4000, "2023-07-10T10:00:00Z", "Achat 2023"),
        // Exercice 2024 : 1 000 de ventes, 3 000 d'achats → perte 2 000.
        e("411000", 1000, 0, "2024-03-10T10:00:00Z", "Facture 2024"),
        e("706000", 0, 1000, "2024-03-10T10:00:00Z", "Facture 2024"),
        e("601000", 3000, 0, "2024-04-10T10:00:00Z", "Achat 2024"),
        e("512000", 0, 3000, "2024-04-10T10:00:00Z", "Achat 2024"),
      ])
    );
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const maintenant = new Date("2026-11-02T10:00:00Z");

  test("l'ordre est imposé : on ne clôture pas 2024 avant 2023", async () => {
    const apercu = await avecEntreprise(A, (tx) => apercuCloture(tx, A, 2024, maintenant));
    expect(apercu?.obstacles).toContain("Clôturez d'abord les exercices précédents, dans l'ordre.");
    const refus = await avecEntreprise(A, (tx) => cloturerExercice(tx, A, uA, 2024, maintenant));
    expect(refus.ok).toBe(false);
    expect(await avecEntreprise(A, (tx) => tx.select().from(clotureExercice))).toHaveLength(0);
  });

  test("un exercice non terminé ne se clôture pas", async () => {
    const apercu = await avecEntreprise(A, (tx) => apercuCloture(tx, A, 2026, maintenant));
    expect(apercu?.obstacles).toContain("Cet exercice n'est pas terminé : on ne clôture qu'après le 31 décembre.");
  });

  test("clôture 2023 : écriture équilibrée, résultat au 120000, comptes de gestion à zéro, verrou posé, une seule fois", async () => {
    const apercu = await avecEntreprise(A, (tx) => apercuCloture(tx, A, 2023, maintenant));
    expect(apercu).toMatchObject({ produits: 10000, charges: 4000, obstacles: [] });
    expect(apercu?.plan.resultatNet).toBe(6000);

    const r = await avecEntreprise(A, (tx) => cloturerExercice(tx, A, uA, 2023, maintenant));
    expect(r).toMatchObject({ ok: true, resultatNet: 6000 });

    const balance = await avecEntreprise(A, (tx) => calculerBalance(tx, A));
    const solde = (n: string) => balance.find((l) => l.numero === n)?.solde ?? 0;
    expect(solde("706000")).toBe(0 - 1000); // seules les ventes 2024 restent (créditeur)
    expect(solde("601000")).toBe(3000);
    expect(solde("120000")).toBe(-6000);
    expect(balance.reduce((s, l) => s + l.debit, 0)).toBe(balance.reduce((s, l) => s + l.credit, 0));

    const [cloture] = await avecEntreprise(A, (tx) => tx.select().from(clotureExercice));
    expect(cloture).toMatchObject({ annee: 2023, resultatNet: 6000 });
    const [verrou] = await avecEntreprise(A, (tx) => tx.select({ v: entreprise.dateVerrouillageComptable }).from(entreprise).where(eq(entreprise.id, A)));
    expect(verrou.v?.toISOString()).toBe("2023-12-31T22:59:59.999Z");
    const journaux = await avecEntreprise(A, (tx) => tx.select().from(journalManuel));
    expect(journaux.map((j) => j.libelle)).toEqual(["Clôture de l'exercice 2023"]);

    expect((await avecEntreprise(A, (tx) => cloturerExercice(tx, A, uA, 2023, maintenant))).ok).toBe(false);
  });

  test("clôture 2024 en perte, puis le compte de résultat et le dossier de l'expert restent lisibles malgré la clôture", async () => {
    // Le verrou posé par 2023 s'arrête au 31/12/2023 : l'exercice 2024 reste clôturable.
    const r = await avecEntreprise(A, (tx) => cloturerExercice(tx, A, uA, 2024, maintenant));
    expect(r).toMatchObject({ ok: true, resultatNet: -2000 });
    const balance = await avecEntreprise(A, (tx) => calculerBalance(tx, A));
    expect(balance.find((l) => l.numero === "129000")?.solde).toBe(2000);
    expect(balance.find((l) => l.numero === "120000")?.solde).toBe(-6000);
    expect(balance.filter((l) => l.classe === 6 || l.classe === 7).every((l) => l.solde === 0)).toBe(true);

    const zip = await avecEntreprise(A, (tx) => construireDossierExpert(tx, A, 2023, maintenant));
    expect(zip).not.toBeNull();
    const texte = zip!.toString("utf8");
    for (const nom of ["LISEZMOI.txt", "grand-livre.csv", "balance.csv", "journaux.csv", "plan-comptable.csv", "compte-de-resultat.csv", "bilan.csv", "tva.csv"]) expect(texte).toContain(nom);
    expect(zip!.readUInt16LE(zip!.length - 22 + 10)).toBe(8);
    // Le compte de résultat 2023 est lu SANS l'écriture de clôture : produits 10 000, charges 4 000, résultat 6 000.
    expect(texte).toContain("TOTAL DES PRODUITS;10000");
    expect(texte).toContain("TOTAL DES CHARGES;4000");
    expect(texte).toContain("RÉSULTAT NET (bénéfice);6000");
  });

  test("fuite entre entreprises : B ne voit aucune clôture de A et n'en déclenche aucune sur A", async () => {
    expect(await avecEntreprise(B, (tx) => tx.select().from(clotureExercice))).toEqual([]);
    expect(await avecEntreprise(B, (tx) => tx.select().from(journalManuel))).toEqual([]);
    const apercuB = await avecEntreprise(B, (tx) => apercuCloture(tx, B, 2023, maintenant));
    expect(apercuB?.dejaCloture).toBeNull();
    expect(apercuB?.plan.lignes).toEqual([]);
    const refus = await avecEntreprise(B, (tx) => cloturerExercice(tx, B, uB, 2023, maintenant));
    expect(refus.ok).toBe(false);
    const zipB = await avecEntreprise(B, (tx) => construireDossierExpert(tx, B, 2023, maintenant));
    expect(zipB!.toString("utf8")).not.toContain("Facture 2023");
  });
});

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { compteComptable, ecritureComptable, entreprise } from "@/db/schema";
import {
  construireBalance,
  construireGrandLivre,
  dateDouala,
  journalDeEcriture,
  lireBalancePeriode,
  lireGrandLivre,
  lireJournaux,
  periodePredefinie,
  type LigneLivre,
} from "@/lib/comptabilite/livres";
import { csvBalance, csvGrandLivre } from "@/lib/comptabilite/livres-export";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

const aucune = { factureId: null, paiementId: null, depenseId: null, factureFournisseurId: null, paiementEffectueId: null, recuVenteId: null, factureAcompteId: null, journalManuelId: null };

describe("Livres comptables — règles pures", () => {
  test("dates à l'heure de Douala, jours inexistants refusés", () => {
    expect(dateDouala("2026-03-15", false)?.toISOString()).toBe("2026-03-14T23:00:00.000Z");
    expect(dateDouala("2026-03-15", true)?.toISOString()).toBe("2026-03-15T22:59:59.999Z");
    expect(dateDouala("2026-02-31", false)).toBeNull();
    expect(dateDouala("15/03/2026", false)).toBeNull();
    expect(dateDouala(undefined, false)).toBeNull();
  });

  test("périodes rapides", () => {
    const maintenant = new Date("2026-11-02T10:00:00Z");
    expect(periodePredefinie("mois", maintenant)).toEqual({ du: "2026-11-01", au: "2026-11-30" });
    expect(periodePredefinie("trimestre", maintenant)).toEqual({ du: "2026-10-01", au: "2026-12-31" });
    expect(periodePredefinie("annee", maintenant)).toEqual({ du: "2026-01-01", au: "2026-12-31" });
    expect(periodePredefinie("annee-derniere", maintenant)).toEqual({ du: "2025-01-01", au: "2025-12-31" });
    expect(periodePredefinie("mois", new Date("2026-02-10T10:00:00Z"))).toEqual({ du: "2026-02-01", au: "2026-02-28" });
  });

  test("journal déduit de l'origine : OD d'abord, puis trésorerie, achats, ventes", () => {
    expect(journalDeEcriture({ ...aucune, factureId: "f" })).toBe("VT");
    expect(journalDeEcriture({ ...aucune, recuVenteId: "r" })).toBe("VT");
    expect(journalDeEcriture({ ...aucune, factureId: "f", paiementId: "p" })).toBe("TR");
    expect(journalDeEcriture({ ...aucune, depenseId: "d" })).toBe("AC");
    expect(journalDeEcriture({ ...aucune, factureFournisseurId: "x" })).toBe("AC");
    expect(journalDeEcriture({ ...aucune, paiementEffectueId: "p" })).toBe("TR");
    expect(journalDeEcriture({ ...aucune, journalManuelId: "j" })).toBe("OD");
    expect(journalDeEcriture(aucune)).toBe("OD");
  });

  const l = (numeroCompte: string, debit: number, credit: number, date = "2026-03-10"): LigneLivre => ({ id: `${numeroCompte}-${debit}-${credit}-${date}`, date: new Date(`${date}T10:00:00Z`), libelle: "x", numeroCompte, libelleCompte: `Compte ${numeroCompte}`, debit, credit, journal: "VT" });

  test("grand livre : solde reporté, solde cumulé ligne par ligne, totaux", () => {
    const avant = [l("411000", 1000, 0, "2025-12-01"), l("411000", 0, 400, "2025-12-15")];
    const periode = [l("411000", 500, 0), l("411000", 0, 300, "2026-03-20"), l("706000", 0, 500)];
    const gl = construireGrandLivre(avant, periode);
    const clients = gl.find((c) => c.numero === "411000")!;
    expect(clients.soldeOuverture).toBe(600);
    expect(clients.lignes.map((x) => x.soldeCumule)).toEqual([1100, 800]);
    expect(clients).toMatchObject({ totalDebit: 500, totalCredit: 300, soldeCloture: 800 });
    expect(gl.map((c) => c.numero)).toEqual(["411000", "706000"]);
  });

  test("grand livre : un compte soldé à l'ouverture sans mouvement n'apparaît pas, un compte reporté non soldé apparaît", () => {
    const avant = [l("512000", 100, 0, "2025-12-01"), l("512000", 0, 100, "2025-12-02"), l("411000", 300, 0, "2025-12-01")];
    const gl = construireGrandLivre(avant, []);
    expect(gl.map((c) => c.numero)).toEqual(["411000"]);
    expect(gl[0]).toMatchObject({ soldeOuverture: 300, soldeCloture: 300, lignes: [] });
  });

  test("balance : colonnes d'ouverture, mouvements et clôture, équilibre", () => {
    const avant = [l("411000", 1000, 0, "2025-12-01"), l("706000", 0, 1000, "2025-12-01")];
    const periode = [l("411000", 500, 0), l("706000", 0, 500), l("512000", 400, 0), l("411000", 0, 400)];
    const b = construireBalance(avant, periode);
    const clients = b.lignes.find((x) => x.numero === "411000")!;
    expect(clients).toMatchObject({ ouvertureDebit: 1000, ouvertureCredit: 0, mouvementDebit: 500, mouvementCredit: 400, clotureDebit: 1100, clotureCredit: 0 });
    expect(b.lignes.find((x) => x.numero === "706000")).toMatchObject({ ouvertureCredit: 1000, clotureCredit: 1500, clotureDebit: 0 });
    expect(b.equilibree).toBe(true);
    expect(b.totaux.mouvementDebit).toBe(b.totaux.mouvementCredit);
  });

  test("balance déséquilibrée détectée", () => {
    expect(construireBalance([], [l("411000", 500, 0), l("706000", 0, 400)]).equilibree).toBe(false);
  });

  test("export CSV : montants entiers bruts, reports et totaux", () => {
    const gl = construireGrandLivre([l("411000", 1000, 0, "2025-12-01")], [l("411000", 500, 0)]);
    const csv = csvGrandLivre(gl);
    expect(csv.lignes.map((x) => x[3])).toEqual(["Solde reporté", "x", "Total du compte"]);
    expect(csv.lignes[1].slice(4)).toEqual(["500", "0", "1500"]);
    const bal = csvBalance(construireBalance([], [l("411000", 500, 0), l("706000", 0, 500)]));
    expect(bal.lignes.at(-1)?.[1]).toBe("TOTAL");
  });
});

describe("Livres comptables — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Livres A ${suffixe}`;
  const nomB = `TEST Livres B ${suffixe}`;
  let entrepriseA: string;
  let entrepriseB: string;
  let comptes: Record<string, string> = {};

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseA = a.id;
    entrepriseB = b.id;
    const lignes = await db.select({ id: compteComptable.id, numero: compteComptable.numero }).from(compteComptable).where(inArray(compteComptable.numero, ["411000", "706000", "512000"]));
    comptes = Object.fromEntries(lignes.map((c) => [c.numero, c.id]));
    expect(Object.keys(comptes)).toHaveLength(3);

    const ecriture = (compte: string, debit: number, credit: number, date: string, extra: Partial<typeof ecritureComptable.$inferInsert> = {}) => ({
      entrepriseId: entrepriseA,
      dateEcriture: new Date(date),
      libelle: `Écriture ${compte} ${date}`,
      compteId: comptes[compte],
      debit,
      credit,
      ...extra,
    });
    await avecEntreprise(entrepriseA, (tx) =>
      tx.insert(ecritureComptable).values([
        // Avant la période (report à nouveau).
        ecriture("411000", 1000, 0, "2025-12-10T10:00:00Z", { factureId: "f0" }),
        ecriture("706000", 0, 1000, "2025-12-10T10:00:00Z", { factureId: "f0" }),
        // Dans la période.
        ecriture("411000", 500, 0, "2026-03-10T10:00:00Z", { factureId: "f1" }),
        ecriture("706000", 0, 500, "2026-03-10T10:00:00Z", { factureId: "f1" }),
        ecriture("512000", 400, 0, "2026-03-20T10:00:00Z", { paiementId: "p1" }),
        ecriture("411000", 0, 400, "2026-03-20T10:00:00Z", { paiementId: "p1" }),
        // Tout dernier instant de l'année à Douala (31/12 23:30 locale = 22:30 UTC) : dans la période.
        ecriture("512000", 10, 0, "2026-12-31T22:30:00Z", { journalManuelId: "j1" }),
        ecriture("706000", 0, 10, "2026-12-31T22:30:00Z", { journalManuelId: "j1" }),
        // Premier instant de l'année suivante à Douala (01/01/2027 00:30 locale = 31/12 23:30 UTC) : hors période.
        ecriture("512000", 99, 0, "2026-12-31T23:30:00Z"),
        ecriture("706000", 0, 99, "2026-12-31T23:30:00Z"),
      ])
    );
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const periode = { du: dateDouala("2026-01-01", false)!, au: dateDouala("2026-12-31", true)! };

  test("grand livre : report, mouvements de la période et solde cumulé", async () => {
    const gl = await avecEntreprise(entrepriseA, (tx) => lireGrandLivre(tx, entrepriseA, periode));
    const clients = gl.find((c) => c.numero === "411000")!;
    expect(clients.soldeOuverture).toBe(1000);
    expect(clients.lignes.map((x) => x.soldeCumule)).toEqual([1500, 1100]);
    const banque = gl.find((c) => c.numero === "512000")!;
    expect(banque.lignes).toHaveLength(2);
    expect(banque.soldeCloture).toBe(410);
    expect(banque.lignes.some((x) => x.debit === 99)).toBe(false);

    const unSeul = await avecEntreprise(entrepriseA, (tx) => lireGrandLivre(tx, entrepriseA, periode, "706000"));
    expect(unSeul.map((c) => c.numero)).toEqual(["706000"]);
  });

  test("balance équilibrée et journaux classés par origine", async () => {
    const balance = await avecEntreprise(entrepriseA, (tx) => lireBalancePeriode(tx, entrepriseA, periode));
    expect(balance.equilibree).toBe(true);
    expect(balance.totaux.mouvementDebit).toBe(500 + 400 + 10);

    const journaux = await avecEntreprise(entrepriseA, (tx) => lireJournaux(tx, entrepriseA, periode));
    const nb = Object.fromEntries(journaux.map((j) => [j.code, j.lignes.length]));
    expect(nb).toEqual({ VT: 2, AC: 0, TR: 2, OD: 2 });
  });

  test("fuite entre entreprises : B ne voit aucune écriture de A, quel que soit le livre", async () => {
    const gl = await avecEntreprise(entrepriseB, (tx) => lireGrandLivre(tx, entrepriseB, periode));
    expect(gl).toEqual([]);
    const balance = await avecEntreprise(entrepriseB, (tx) => lireBalancePeriode(tx, entrepriseB, periode));
    expect(balance.lignes).toEqual([]);
    const journaux = await avecEntreprise(entrepriseB, (tx) => lireJournaux(tx, entrepriseB, periode));
    expect(journaux.every((j) => j.lignes.length === 0)).toBe(true);
    // Même en demandant l'identifiant de A dans la session de B, la protection par entreprise ne renvoie rien.
    const forge = await avecEntreprise(entrepriseB, (tx) => lireGrandLivre(tx, entrepriseA, periode));
    expect(forge).toEqual([]);
  });
});

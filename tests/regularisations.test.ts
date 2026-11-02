import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur } from "@/db/schema";
import { enregistrerRegularisation } from "@/lib/comptabilite/regularisations";
import { lignesExtourne, lignesRegularisation, premierJanvierSuivant } from "@/lib/comptabilite/regularisations-regles";
import { calculerBalance } from "@/lib/comptabilite/etats-financiers";
import { lireJournaux, dateDouala } from "@/lib/comptabilite/livres";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Priorité 2.4 : régularisations de fin d'exercice (charge à payer, produit à recevoir, constatés d'avance, provision) et extourne. */
describe("Régularisations — règles pures", () => {
  test("chaque type produit une écriture équilibrée sur les bons comptes", () => {
    expect(lignesRegularisation("CHARGE_A_PAYER", 5000, "605000")).toEqual([{ numero: "605000", debit: 5000, credit: 0 }, { numero: "408000", debit: 0, credit: 5000 }]);
    expect(lignesRegularisation("PRODUIT_A_RECEVOIR", 7000, "706000")).toEqual([{ numero: "418000", debit: 7000, credit: 0 }, { numero: "706000", debit: 0, credit: 7000 }]);
    expect(lignesRegularisation("CHARGE_CONSTATEE_AVANCE", 3000, "616000")).toEqual([{ numero: "476000", debit: 3000, credit: 0 }, { numero: "616000", debit: 0, credit: 3000 }]);
    expect(lignesRegularisation("PRODUIT_CONSTATE_AVANCE", 4000, "706000")).toEqual([{ numero: "706000", debit: 4000, credit: 0 }, { numero: "477000", debit: 0, credit: 4000 }]);
    expect(lignesRegularisation("PROVISION", 9000, null)).toEqual([{ numero: "691000", debit: 9000, credit: 0 }, { numero: "191000", debit: 0, credit: 9000 }]);
  });

  test("montant invalide ou compte manquant refusés ; l'extourne est le miroir exact", () => {
    expect(lignesRegularisation("CHARGE_A_PAYER", 0, "605000")).toBeNull();
    expect(lignesRegularisation("CHARGE_A_PAYER", 10.5, "605000")).toBeNull();
    expect(lignesRegularisation("CHARGE_A_PAYER", 100, null)).toBeNull();
    const l = lignesRegularisation("CHARGE_A_PAYER", 100, "605000")!;
    expect(lignesExtourne(l)).toEqual([{ numero: "605000", debit: 0, credit: 100 }, { numero: "408000", debit: 100, credit: 0 }]);
  });

  test("l'extourne tombe le 1er janvier de l'année suivante, heure de Douala", () => {
    expect(premierJanvierSuivant(dateDouala("2026-12-31", false)!).toISOString()).toBe("2026-12-31T23:00:00.000Z");
    expect(premierJanvierSuivant(dateDouala("2026-03-15", false)!).toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });
});

describe("Régularisations — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Regul A ${suffixe}`;
  const nomB = `TEST Regul B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  const maintenant = new Date("2026-11-02T10:00:00Z");
  const fin2025 = dateDouala("2025-12-31", false)!;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: A, email: `regul-a-${suffixe}@vertexone.test`, nomComplet: "Admin Regul A", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = ua.id;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  test("charge à payer avec extourne : deux journaux, le solde de 408000 est nul après l'extourne, la charge reste dans l'exercice", async () => {
    const r = await avecEntreprise(A, (tx) => enregistrerRegularisation(tx, A, uA, { type: "CHARGE_A_PAYER", montant: 25000, compteGestion: "605000", date: fin2025, libelle: "Électricité de décembre", extourne: true }, maintenant));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.numeroExtourne).not.toBeNull();
    expect(r.numero).not.toBe(r.numeroExtourne);

    const fin = await avecEntreprise(A, (tx) => calculerBalance(tx, A, fin2025));
    expect(fin.find((l) => l.numero === "605000")?.solde).toBe(25000);
    expect(fin.find((l) => l.numero === "408000")?.solde).toBe(-25000);

    const apres = await avecEntreprise(A, (tx) => calculerBalance(tx, A, dateDouala("2026-01-31", true)!));
    expect(apres.find((l) => l.numero === "408000")?.solde ?? 0).toBe(0);
    expect(apres.find((l) => l.numero === "605000")?.solde ?? 0).toBe(0);

    const journaux = await avecEntreprise(A, (tx) => lireJournaux(tx, A, { du: dateDouala("2025-12-01", false)!, au: dateDouala("2026-01-31", true)! }));
    expect(JSON.stringify(journaux)).toContain("Extourne");
  }, 120_000);

  test("provision sans extourne même si demandée ; produit constaté d'avance sur compte de produit", async () => {
    const p = await avecEntreprise(A, (tx) => enregistrerRegularisation(tx, A, uA, { type: "PROVISION", montant: 80000, compteGestion: null, date: fin2025, libelle: "Litige client", extourne: true }, maintenant));
    expect(p.ok && p.numeroExtourne).toBeNull();
    const pca = await avecEntreprise(A, (tx) => enregistrerRegularisation(tx, A, uA, { type: "PRODUIT_CONSTATE_AVANCE", montant: 40000, compteGestion: "706000", date: fin2025, libelle: "Abonnement 2026", extourne: false }, maintenant));
    expect(pca.ok).toBe(true);
    const fin = await avecEntreprise(A, (tx) => calculerBalance(tx, A, fin2025));
    expect(fin.find((l) => l.numero === "191000")?.solde).toBe(-80000);
    expect(fin.find((l) => l.numero === "691000")?.solde).toBe(80000);
    expect(fin.find((l) => l.numero === "477000")?.solde).toBe(-40000);
  }, 120_000);

  test("refus : mauvaise classe de compte, montant nul, date future, libellé vide, période verrouillée (écriture et extourne)", async () => {
    const essai = (p: Partial<Parameters<typeof enregistrerRegularisation>[3]>) =>
      avecEntreprise(A, (tx) => enregistrerRegularisation(tx, A, uA, { type: "CHARGE_A_PAYER", montant: 1000, compteGestion: "605000", date: fin2025, libelle: "x", extourne: false, ...p }, maintenant));
    const classe = await essai({ compteGestion: "706000" });
    expect(classe.ok).toBe(false);
    expect((await essai({ montant: 0 })).ok).toBe(false);
    expect((await essai({ date: dateDouala("2027-06-01", false)! })).ok).toBe(false);
    expect((await essai({ libelle: "  " })).ok).toBe(false);
    expect((await essai({ compteGestion: "999999" })).ok).toBe(false);

    await db.update(entreprise).set({ dateVerrouillageComptable: dateDouala("2026-01-31", true)! }).where((await import("drizzle-orm")).eq(entreprise.id, A));
    expect((await essai({ extourne: true })).ok).toBe(false); // l'extourne du 1er janvier 2026 tombe dans la période verrouillée
    expect((await essai({ extourne: false })).ok).toBe(false);
    await db.update(entreprise).set({ dateVerrouillageComptable: null }).where((await import("drizzle-orm")).eq(entreprise.id, A));
  }, 120_000);

  test("fuite entre entreprises : B ne voit aucune des régularisations de A", async () => {
    const balance = await avecEntreprise(B, (tx) => calculerBalance(tx, B, fin2025));
    expect(balance.filter((l) => l.solde !== 0)).toEqual([]);
    const journaux = await avecEntreprise(B, (tx) => lireJournaux(tx, B, { du: dateDouala("2025-01-01", false)!, au: dateDouala("2026-12-31", true)! }));
    expect(JSON.stringify(journaux)).not.toContain("Électricité de décembre");
  }, 120_000);
});

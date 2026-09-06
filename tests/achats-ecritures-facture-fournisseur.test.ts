import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, ecritureComptable, compteComptable } from "@/db/schema";
import { genererEcrituresFactureFournisseur, genererEcrituresPaiementEffectue } from "@/lib/comptabilite/ecritures";

/**
 * Vérifie la génération automatique des écritures comptables d'une Facture
 * fournisseur et de son règlement (cycle Achats, deuxième tranche, échange
 * du 2026-09-07) — miroir de tests/palier-4-ecritures-comptables.test.ts.
 */
describe("Achats — génération des écritures comptables (facture fournisseur/paiement effectué)", () => {
  let entrepriseId: string;
  let compteChargeId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Achats Écritures Fact Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [uneLigne] = await db.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.numero, "604000"));
    compteChargeId = uneLigne.id;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, (tx) => tx.delete(ecritureComptable).where(eq(ecritureComptable.entrepriseId, entrepriseId)));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("une facture fournisseur avec TVA récupérable débite la charge et la TVA, crédite Fournisseurs (401000), à l'équilibre", async () => {
    await avecEntreprise(entrepriseId, (tx) =>
      genererEcrituresFactureFournisseur(tx, {
        id: "facture-fournisseur-test-1",
        entrepriseId,
        numero: "FA-TEST-0001",
        compteComptableId: compteChargeId,
        dateFacture: new Date(),
        montantHT: 80_000,
        montantTVA: 15_400,
        montantTTC: 95_400,
      })
    );

    const lignes = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .select({ numero: compteComptable.numero, debit: ecritureComptable.debit, credit: ecritureComptable.credit })
        .from(ecritureComptable)
        .innerJoin(compteComptable, eq(ecritureComptable.compteId, compteComptable.id))
        .where(and(eq(ecritureComptable.entrepriseId, entrepriseId), eq(ecritureComptable.factureFournisseurId, "facture-fournisseur-test-1")))
    );

    expect(lignes).toHaveLength(3);
    expect(lignes.find((l) => l.numero === "604000")?.debit).toBe(80_000);
    expect(lignes.find((l) => l.numero === "445200")?.debit).toBe(15_400);
    expect(lignes.find((l) => l.numero === "401000")?.credit).toBe(95_400);

    const totalDebit = lignes.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lignes.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });

  test("le règlement d'une facture fournisseur débite Fournisseurs (401000) et crédite la trésorerie", async () => {
    await avecEntreprise(entrepriseId, (tx) =>
      genererEcrituresPaiementEffectue(tx, {
        entrepriseId,
        factureFournisseurId: "facture-fournisseur-test-1",
        paiementEffectueId: "paiement-effectue-test-1",
        numeroFactureFournisseur: "FA-TEST-0001",
        montant: 95_400,
        moyenPaiement: "manuel",
        datePaiement: new Date(),
      })
    );

    const lignes = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .select({ numero: compteComptable.numero, debit: ecritureComptable.debit, credit: ecritureComptable.credit })
        .from(ecritureComptable)
        .innerJoin(compteComptable, eq(ecritureComptable.compteId, compteComptable.id))
        .where(and(eq(ecritureComptable.entrepriseId, entrepriseId), eq(ecritureComptable.paiementEffectueId, "paiement-effectue-test-1")))
    );

    expect(lignes).toHaveLength(2);
    expect(lignes.find((l) => l.numero === "401000")?.debit).toBe(95_400);
    expect(lignes.find((l) => l.numero === "571000")?.credit).toBe(95_400);
  });
});

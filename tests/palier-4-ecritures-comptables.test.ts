import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, ecritureComptable, compteComptable } from "@/db/schema";
import { genererEcrituresFactureEmise, genererEcrituresPaiement } from "@/lib/comptabilite/ecritures";

/**
 * Vérifie la génération automatique des écritures comptables (docs/palier-4-*,
 * section 4) contre le référentiel SYSCOHADA réellement importé en base (33
 * comptes, voir CLAUDE.md) — pas de comptes fictifs créés ici, ce test
 * échouerait justement si l'import réel avait un trou sur l'un des comptes
 * utilisés par la facturation (411000/706000/443200/571000/512000).
 */
describe("Palier 4 — génération des écritures comptables", () => {
  let entrepriseId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST P4 Écritures Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, (tx) => tx.delete(ecritureComptable).where(eq(ecritureComptable.entrepriseId, entrepriseId)));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("une facture émise avec TVA génère Clients au débit, Prestations et TVA au crédit, à l'équilibre", async () => {
    await avecEntreprise(entrepriseId, (tx) =>
      genererEcrituresFactureEmise(tx, {
        id: "facture-test-1",
        entrepriseId,
        numero: "FAC-TEST-0001",
        dateEmission: new Date(),
        montantHT: 100_000,
        montantTVA: 19_250,
        montantTTC: 119_250,
      })
    );

    const lignes = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .select({ numero: compteComptable.numero, debit: ecritureComptable.debit, credit: ecritureComptable.credit })
        .from(ecritureComptable)
        .innerJoin(compteComptable, eq(ecritureComptable.compteId, compteComptable.id))
        .where(and(eq(ecritureComptable.entrepriseId, entrepriseId), eq(ecritureComptable.factureId, "facture-test-1")))
    );

    expect(lignes).toHaveLength(3);
    expect(lignes.find((l) => l.numero === "411000")?.debit).toBe(119_250);
    expect(lignes.find((l) => l.numero === "706000")?.credit).toBe(100_000);
    expect(lignes.find((l) => l.numero === "443200")?.credit).toBe(19_250);

    const totalDebit = lignes.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lignes.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });

  test("une facture émise sans TVA n'insère pas de ligne 443200 à zéro", async () => {
    await avecEntreprise(entrepriseId, (tx) =>
      genererEcrituresFactureEmise(tx, {
        id: "facture-test-2",
        entrepriseId,
        numero: "FAC-TEST-0002",
        dateEmission: new Date(),
        montantHT: 50_000,
        montantTVA: 0,
        montantTTC: 50_000,
      })
    );

    const lignes = await avecEntreprise(entrepriseId, (tx) =>
      tx.select().from(ecritureComptable).where(and(eq(ecritureComptable.entrepriseId, entrepriseId), eq(ecritureComptable.factureId, "facture-test-2")))
    );

    expect(lignes).toHaveLength(2);
  });

  test("un paiement manuel débite la Caisse (571000), un paiement électronique débite la Banque (512000)", async () => {
    await avecEntreprise(entrepriseId, (tx) =>
      genererEcrituresPaiement(tx, {
        entrepriseId,
        factureId: "facture-test-1",
        paiementId: "paiement-test-manuel",
        numeroFacture: "FAC-TEST-0001",
        montant: 119_250,
        moyenPaiement: "manuel",
        datePaiement: new Date(),
      })
    );
    await avecEntreprise(entrepriseId, (tx) =>
      genererEcrituresPaiement(tx, {
        entrepriseId,
        factureId: "facture-test-2",
        paiementId: "paiement-test-notchpay",
        numeroFacture: "FAC-TEST-0002",
        montant: 50_000,
        moyenPaiement: "notchpay",
        datePaiement: new Date(),
      })
    );

    const lignesManuel = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .select({ numero: compteComptable.numero, debit: ecritureComptable.debit })
        .from(ecritureComptable)
        .innerJoin(compteComptable, eq(ecritureComptable.compteId, compteComptable.id))
        .where(and(eq(ecritureComptable.entrepriseId, entrepriseId), eq(ecritureComptable.paiementId, "paiement-test-manuel")))
    );
    expect(lignesManuel.find((l) => l.debit === 119_250)?.numero).toBe("571000");

    const lignesElectronique = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .select({ numero: compteComptable.numero, debit: ecritureComptable.debit })
        .from(ecritureComptable)
        .innerJoin(compteComptable, eq(ecritureComptable.compteId, compteComptable.id))
        .where(and(eq(ecritureComptable.entrepriseId, entrepriseId), eq(ecritureComptable.paiementId, "paiement-test-notchpay")))
    );
    expect(lignesElectronique.find((l) => l.debit === 50_000)?.numero).toBe("512000");
  });
});

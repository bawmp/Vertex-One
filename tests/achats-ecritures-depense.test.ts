import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, ecritureComptable, compteComptable } from "@/db/schema";
import { genererEcrituresDepense } from "@/lib/comptabilite/ecritures";

/**
 * Vérifie la génération automatique des écritures comptables d'une Dépense
 * (cycle Achats, inspiré de Zoho Books, échange du 2026-09-06) contre le
 * référentiel SYSCOHADA réellement importé en base — même principe que
 * tests/palier-4-ecritures-comptables.test.ts pour les factures.
 */
describe("Achats — génération des écritures comptables d'une Dépense", () => {
  let entrepriseId: string;
  let compteChargeId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Achats Écritures Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [uneLigne] = await db.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.numero, "605000"));
    compteChargeId = uneLigne.id;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, (tx) => tx.delete(ecritureComptable).where(eq(ecritureComptable.entrepriseId, entrepriseId)));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("une dépense avec TVA récupérable débite la charge et la TVA, crédite la trésorerie, à l'équilibre", async () => {
    await avecEntreprise(entrepriseId, (tx) =>
      genererEcrituresDepense(tx, {
        id: "depense-test-1",
        entrepriseId,
        libelle: "Fournitures de bureau",
        compteComptableId: compteChargeId,
        montantHT: 20_000,
        montantTVA: 3_850,
        montantTTC: 23_850,
        moyenPaiement: "virement",
        datePaiement: new Date(),
      })
    );

    const lignes = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .select({ numero: compteComptable.numero, debit: ecritureComptable.debit, credit: ecritureComptable.credit })
        .from(ecritureComptable)
        .innerJoin(compteComptable, eq(ecritureComptable.compteId, compteComptable.id))
        .where(and(eq(ecritureComptable.entrepriseId, entrepriseId), eq(ecritureComptable.depenseId, "depense-test-1")))
    );

    expect(lignes).toHaveLength(3);
    expect(lignes.find((l) => l.numero === "605000")?.debit).toBe(20_000);
    expect(lignes.find((l) => l.numero === "445200")?.debit).toBe(3_850);
    expect(lignes.find((l) => l.numero === "512000")?.credit).toBe(23_850);

    const totalDebit = lignes.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lignes.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });

  test("une dépense sans TVA récupérable n'insère pas de ligne 445200 à zéro", async () => {
    await avecEntreprise(entrepriseId, (tx) =>
      genererEcrituresDepense(tx, {
        id: "depense-test-2",
        entrepriseId,
        libelle: "Achat comptant",
        compteComptableId: compteChargeId,
        montantHT: 5_000,
        montantTVA: 0,
        montantTTC: 5_000,
        moyenPaiement: "especes",
        datePaiement: new Date(),
      })
    );

    const lignes = await avecEntreprise(entrepriseId, (tx) =>
      tx.select().from(ecritureComptable).where(and(eq(ecritureComptable.entrepriseId, entrepriseId), eq(ecritureComptable.depenseId, "depense-test-2")))
    );
    expect(lignes).toHaveLength(2);
  });

  test("une dépense en espèces débite la Caisse (571000), une dépense par virement débite la Banque (512000)", async () => {
    const lignesEspeces = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .select({ numero: compteComptable.numero, credit: ecritureComptable.credit })
        .from(ecritureComptable)
        .innerJoin(compteComptable, eq(ecritureComptable.compteId, compteComptable.id))
        .where(and(eq(ecritureComptable.entrepriseId, entrepriseId), eq(ecritureComptable.depenseId, "depense-test-2")))
    );
    expect(lignesEspeces.find((l) => l.credit === 5_000)?.numero).toBe("571000");

    const lignesVirement = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .select({ numero: compteComptable.numero, credit: ecritureComptable.credit })
        .from(ecritureComptable)
        .innerJoin(compteComptable, eq(ecritureComptable.compteId, compteComptable.id))
        .where(and(eq(ecritureComptable.entrepriseId, entrepriseId), eq(ecritureComptable.depenseId, "depense-test-1")))
    );
    expect(lignesVirement.find((l) => l.credit === 23_850)?.numero).toBe("512000");
  });
});

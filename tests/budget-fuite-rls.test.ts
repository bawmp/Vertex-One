import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, budget, budgetLigne, compteComptable } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour les Budgets
 * (échange du 2026-09-07) — voir CLAUDE.md : "après chaque nouveau module
 * touchant à des données d'entreprise, un test délibéré doit vérifier
 * qu'une entreprise fictive ne peut techniquement pas accéder aux données
 * d'une autre."
 */
describe("Budgets — isolation RLS entre entreprises (budget, budget_ligne)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let budgetMbargaId: string;
  let budgetLigneMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Budget Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Budget Mbarga", secteurProfil: "agence" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-budget-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-budget-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const [compteCharge] = await db.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.classe, 6)).limit(1);

    const [b, bl] = await avecEntreprise(mbargaId, async (tx) => {
      const [budgetCree] = await tx
        .insert(budget)
        .values({ entrepriseId: mbargaId, nom: "Budget Mbarga", dateDebut: new Date("2026-01-01"), dateFin: new Date("2026-12-31"), creeParId: utilisateurMbargaId })
        .returning({ id: budget.id });
      const [ligneCreee] = await tx
        .insert(budgetLigne)
        .values({ entrepriseId: mbargaId, budgetId: budgetCree.id, compteId: compteCharge.id, montant: 100000 })
        .returning({ id: budgetLigne.id });
      return [budgetCree.id, ligneCreee.id];
    });
    budgetMbargaId = b;
    budgetLigneMbargaId = bl;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(budgetLigne).where(eq(budgetLigne.entrepriseId, id));
        await tx.delete(budget).where(eq(budget.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit ni le budget ni les lignes de budget d'une autre, même en ciblant leur id précis", async () => {
    const budgetsVusParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(budget));
    expect(budgetsVusParKiro.some((b) => b.id === budgetMbargaId)).toBe(false);

    const tentativeBudget = await avecEntreprise(kiroId, (tx) => tx.select().from(budget).where(eq(budget.id, budgetMbargaId)));
    expect(tentativeBudget).toHaveLength(0);

    const tentativeLigne = await avecEntreprise(kiroId, (tx) => tx.select().from(budgetLigne).where(eq(budgetLigne.id, budgetLigneMbargaId)));
    expect(tentativeLigne).toHaveLength(0);
  });

  test("une entreprise ne peut ni modifier ni supprimer le budget d'une autre", async () => {
    await avecEntreprise(kiroId, (tx) => tx.update(budget).set({ nom: "Modifié par Kiro" }).where(eq(budget.id, budgetMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(budget).where(eq(budget.id, budgetMbargaId)));
    expect(reel.nom).toBe("Budget Mbarga");

    await avecEntreprise(kiroId, (tx) => tx.delete(budgetLigne).where(eq(budgetLigne.id, budgetLigneMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(budgetLigne).where(eq(budgetLigne.id, budgetLigneMbargaId)));
    expect(toujoursLa).toBeDefined();
  });
});

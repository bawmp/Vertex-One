import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, budget, budgetLigne, ecritureComptable, compteComptable } from "@/db/schema";
import { calculerBalance } from "@/lib/comptabilite/etats-financiers";
import { genererEcrituresDepense, genererEcrituresFactureEmise } from "@/lib/comptabilite/ecritures";

/**
 * Vérifie la logique métier des Budgets (échange du 2026-09-07) : la
 * contrainte unique (un compte ne peut apparaître qu'une fois par budget),
 * et le calcul du réalisé sur la fiche détail (reproduit ici tel qu'il vit
 * dans src/app/app/comptabilite/budgets/[id]/page.tsx) — y compris
 * l'inversion de signe pour un compte de produits (classe 7, créditeur par
 * nature).
 *
 * creerBudget() vérifie la session via recupererUtilisateurConnecte() —
 * indisponible hors requête HTTP réelle dans ce test, donc on reproduit
 * directement la même séquence de mutations que l'action.
 */
describe("Budgets — logique métier", () => {
  let entrepriseId: string;
  let utilisateurId: string;
  let compteChargeId: string;
  let compteProduitId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Budget Logique", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-budget-logique@vertexone.test", nomComplet: "Admin Budget Logique", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurId = u.id;

    const [compteCharge] = await db.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.classe, 6)).limit(1);
    const [compteProduit] = await db.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.classe, 7)).limit(1);
    compteChargeId = compteCharge.id;
    compteProduitId = compteProduit.id;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(ecritureComptable).where(eq(ecritureComptable.entrepriseId, entrepriseId));
      await tx.delete(budgetLigne).where(eq(budgetLigne.entrepriseId, entrepriseId));
      await tx.delete(budget).where(eq(budget.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("un même compte ne peut pas apparaître deux fois dans le même budget (contrainte unique en base)", async () => {
    const dateDebut = new Date("2026-01-01");
    const dateFin = new Date("2026-12-31");

    const idBudget = await avecEntreprise(entrepriseId, async (tx) => {
      const [b] = await tx.insert(budget).values({ entrepriseId, nom: "Budget Test", dateDebut, dateFin, creeParId: utilisateurId }).returning({ id: budget.id });
      await tx.insert(budgetLigne).values({ entrepriseId, budgetId: b.id, compteId: compteChargeId, montant: 100000 });
      return b.id;
    });

    await expect(
      avecEntreprise(entrepriseId, (tx) => tx.insert(budgetLigne).values({ entrepriseId, budgetId: idBudget, compteId: compteChargeId, montant: 50000 }))
    ).rejects.toThrow();
  });

  test("le réalisé se calcule sur la période exacte du budget, avec inversion de signe pour un compte de produits", async () => {
    const dateDebut = new Date("2027-01-01");
    const dateFin = new Date("2027-12-31");

    const idBudget = await avecEntreprise(entrepriseId, async (tx) => {
      const [b] = await tx.insert(budget).values({ entrepriseId, nom: "Budget Réalisé", dateDebut, dateFin, creeParId: utilisateurId }).returning({ id: budget.id });
      await tx.insert(budgetLigne).values([
        { entrepriseId, budgetId: b.id, compteId: compteChargeId, montant: 50000 },
        { entrepriseId, budgetId: b.id, compteId: compteProduitId, montant: 200000 },
      ]);
      return b.id;
    });

    // 30 000 FCFA de charge réelle, 150 000 FCFA de produit réel, dans la période du budget.
    await avecEntreprise(entrepriseId, (tx) =>
      genererEcrituresDepense(tx, {
        id: "depense-budget-test",
        entrepriseId,
        libelle: "Charge dans la période",
        compteComptableId: compteChargeId,
        montantHT: 30000,
        montantTVA: 0,
        montantTTC: 30000,
        moyenPaiement: "manuel",
        datePaiement: new Date("2027-06-01"),
      })
    );
    await avecEntreprise(entrepriseId, (tx) =>
      genererEcrituresFactureEmise(tx, {
        id: "facture-budget-test",
        entrepriseId,
        numero: "FAC-BUDGET-TEST",
        dateEmission: new Date("2027-06-01"),
        montantHT: 150000,
        montantTVA: 0,
        montantTTC: 150000,
      })
    );

    const [lignes, balance] = await Promise.all([
      avecEntreprise(entrepriseId, (tx) =>
        tx
          .select({ montant: budgetLigne.montant, numero: compteComptable.numero, classe: compteComptable.classe })
          .from(budgetLigne)
          .innerJoin(compteComptable, eq(budgetLigne.compteId, compteComptable.id))
          .where(eq(budgetLigne.budgetId, idBudget))
      ),
      avecEntreprise(entrepriseId, (tx) => calculerBalance(tx, entrepriseId, dateFin, dateDebut)),
    ]);

    const soldeParNumero = new Map(balance.map((l) => [l.numero, l.solde]));
    const realiseParClasse = new Map(
      lignes.map((l) => {
        const solde = soldeParNumero.get(l.numero) ?? 0;
        return [l.classe, l.classe === 7 ? -solde : solde];
      })
    );

    expect(realiseParClasse.get(6)).toBe(30000);
    expect(realiseParClasse.get(7)).toBe(150000);
  });
});

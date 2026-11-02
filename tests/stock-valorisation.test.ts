import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { compteComptable, ecritureComptable, entreprise, journalManuel, produit, utilisateur } from "@/db/schema";
import { activerSuiviStock, decrementerStockVente, incrementerStockAchat, nouveauCoutMoyen } from "@/lib/produits/stock";
import { constaterVariationStock, lireValorisation, valeurLigne } from "@/lib/produits/valorisation";
import { calculerBalance } from "@/lib/comptabilite/etats-financiers";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

describe("Valorisation — règles pures", () => {
  test("coût moyen pondéré après un achat", () => {
    expect(nouveauCoutMoyen(10, 100, 10, 2000)).toBe(150);
    expect(nouveauCoutMoyen(20, 150, 5, 755)).toBe(150);
    expect(nouveauCoutMoyen(0, 100, 4, 396)).toBe(99);
    expect(nouveauCoutMoyen(-3, 100, 4, 396)).toBe(99);
    expect(nouveauCoutMoyen(10, 100, 0, 0)).toBe(100);
  });
  test("un stock négatif ne vaut jamais moins que zéro", () => {
    expect(valeurLigne(6, 100)).toBe(600);
    expect(valeurLigne(-4, 100)).toBe(0);
  });
});

describe("Valorisation — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Valo A ${suffixe}`;
  const nomB = `TEST Valo B ${suffixe}`;
  let entrepriseA: string;
  let entrepriseB: string;
  let utilisateurA: string;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseA = a.id;
    entrepriseB = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: entrepriseA, email: `valo-a-${suffixe}@vertexone.test`, nomComplet: "Admin Valo A", role: "ADMIN" }).returning({ id: utilisateur.id });
    utilisateurA = ua.id;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const nouveau = async (valeurs: Partial<typeof produit.$inferInsert> = {}) => {
    const [p] = await avecEntreprise(entrepriseA, (tx) =>
      tx.insert(produit).values({ entrepriseId: entrepriseA, type: "BIEN", nom: "Article valo", suiviStock: true, stockActuel: 10, coutMoyen: 100, prixAchat: 100, creeParId: utilisateurA, ...valeurs }).returning({ id: produit.id })
    );
    return p.id;
  };
  const lire = async (id: string) => (await avecEntreprise(entrepriseA, (tx) => tx.select({ stock: produit.stockActuel, cout: produit.coutMoyen }).from(produit).where(eq(produit.id, id))))[0];

  test("achats : le coût moyen se pondère, une vente ne le change pas, un achat sans prix non plus", async () => {
    const id = await nouveau();
    await avecEntreprise(entrepriseA, (tx) => incrementerStockAchat(tx, entrepriseA, [{ produitId: id, quantite: 10, prixUnitaire: 200 }]));
    expect(await lire(id)).toEqual({ stock: 20, cout: 150 });

    await avecEntreprise(entrepriseA, (tx) => decrementerStockVente(tx, entrepriseA, [{ produitId: id, quantite: 5, prixUnitaire: 9999 }]));
    expect(await lire(id)).toEqual({ stock: 15, cout: 150 });

    await avecEntreprise(entrepriseA, (tx) => incrementerStockAchat(tx, entrepriseA, [{ produitId: id, quantite: 5 }]));
    expect(await lire(id)).toEqual({ stock: 20, cout: 150 });

    // Deux lignes du même produit dans un même achat : quantités et valeurs se cumulent (10 à 100 + 10 à 300 = 4 000 pour 20).
    await avecEntreprise(entrepriseA, (tx) =>
      incrementerStockAchat(tx, entrepriseA, [
        { produitId: id, quantite: 10, prixUnitaire: 100 },
        { produitId: id, quantite: 10, prixUnitaire: 300 },
      ])
    );
    expect(await lire(id)).toEqual({ stock: 40, cout: Math.round((20 * 150 + 4000) / 40) });
  });

  test("stock vide ou négatif : le coût devient celui de l'achat", async () => {
    const vide = await nouveau({ stockActuel: 0, coutMoyen: 500 });
    await avecEntreprise(entrepriseA, (tx) => incrementerStockAchat(tx, entrepriseA, [{ produitId: vide, quantite: 4, prixUnitaire: 99 }]));
    expect(await lire(vide)).toEqual({ stock: 4, cout: 99 });
    const negatif = await nouveau({ stockActuel: -3, coutMoyen: 500 });
    await avecEntreprise(entrepriseA, (tx) => incrementerStockAchat(tx, entrepriseA, [{ produitId: negatif, quantite: 5, prixUnitaire: 80 }]));
    expect(await lire(negatif)).toEqual({ stock: 2, cout: 80 });
  });

  test("activer le suivi : le coût de départ est le prix d'achat", async () => {
    const id = await nouveau({ suiviStock: false, stockActuel: 0, coutMoyen: 0, prixAchat: 350 });
    await avecEntreprise(entrepriseA, (tx) => activerSuiviStock(tx, entrepriseA, id, 8, utilisateurA));
    expect(await lire(id)).toEqual({ stock: 8, cout: 350 });
  });

  test("variation de stock : écriture équilibrée 311/603, idempotente, puis dans l'autre sens après une vente", async () => {
    // Entreprise isolée de la valeur des autres tests : on valorise ici un seul produit neuf.
    const a2 = `TEST Valo C ${suffixe}`;
    const [e] = await db.insert(entreprise).values({ nom: a2, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [u] = await db.insert(utilisateur).values({ entrepriseId: e.id, email: `valo-c-${suffixe}@vertexone.test`, nomComplet: "Admin Valo C", role: "ADMIN" }).returning({ id: utilisateur.id });
    try {
      const [p] = await avecEntreprise(e.id, (tx) => tx.insert(produit).values({ entrepriseId: e.id, type: "BIEN", nom: "Riz", suiviStock: true, stockActuel: 10, coutMoyen: 100, prixAchat: 100, creeParId: u.id }).returning({ id: produit.id }));

      const avant = await avecEntreprise(e.id, (tx) => lireValorisation(tx, e.id));
      expect(avant).toMatchObject({ total: 1000, soldeComptable: 0, ecart: 1000 });

      const r1 = await avecEntreprise(e.id, (tx) => constaterVariationStock(tx, e.id, u.id, new Date()));
      expect(r1).toMatchObject({ ok: true, montant: 1000, hausse: true });
      const balance1 = await avecEntreprise(e.id, (tx) => calculerBalance(tx, e.id));
      expect(balance1.find((l) => l.numero === "311000")).toMatchObject({ debit: 1000, credit: 0, solde: 1000 });
      expect(balance1.find((l) => l.numero === "603000")).toMatchObject({ debit: 0, credit: 1000 });
      expect(balance1.reduce((s, l) => s + l.debit, 0)).toBe(balance1.reduce((s, l) => s + l.credit, 0));
      expect((await avecEntreprise(e.id, (tx) => tx.select().from(journalManuel))).length).toBe(1);

      // Refaire l'écriture sans mouvement : rien à enregistrer.
      const r2 = await avecEntreprise(e.id, (tx) => constaterVariationStock(tx, e.id, u.id, new Date()));
      expect(r2.ok).toBe(false);

      // Une vente de 4 unités : le stock vaut 600, la comptabilité en reconnaît 1 000 → baisse de 400.
      await avecEntreprise(e.id, (tx) => decrementerStockVente(tx, e.id, [{ produitId: p.id, quantite: 4 }]));
      const r3 = await avecEntreprise(e.id, (tx) => constaterVariationStock(tx, e.id, u.id, new Date()));
      expect(r3).toMatchObject({ ok: true, montant: 400, hausse: false });
      const balance2 = await avecEntreprise(e.id, (tx) => calculerBalance(tx, e.id));
      expect(balance2.find((l) => l.numero === "311000")?.solde).toBe(600);
      expect(balance2.find((l) => l.numero === "603000")).toMatchObject({ debit: 400, credit: 1000 });

      // Date future refusée ; période verrouillée refusée.
      const futur = await avecEntreprise(e.id, (tx) => constaterVariationStock(tx, e.id, u.id, new Date(Date.now() + 10 * 24 * 3600 * 1000)));
      expect(futur.ok).toBe(false);
      await db.update(entreprise).set({ dateVerrouillageComptable: new Date(Date.now() + 3 * 24 * 3600 * 1000) }).where(eq(entreprise.id, e.id));
      await avecEntreprise(e.id, (tx) => decrementerStockVente(tx, e.id, [{ produitId: p.id, quantite: 1 }]));
      const verrou = await avecEntreprise(e.id, (tx) => constaterVariationStock(tx, e.id, u.id, new Date()));
      expect(verrou.ok).toBe(false);
    } finally {
      await supprimerEntrepriseDeTest(a2);
    }
  }, 120_000);

  test("fuite entre entreprises : B ne voit ni les produits ni la valeur de A, et ne passe aucune écriture sur eux", async () => {
    await nouveau({ nom: "Article secret A" });
    const vueB = await avecEntreprise(entrepriseB, (tx) => lireValorisation(tx, entrepriseB));
    expect(vueB).toMatchObject({ lignes: [], total: 0, soldeComptable: 0, ecart: 0 });
    const forge = await avecEntreprise(entrepriseB, (tx) => lireValorisation(tx, entrepriseA));
    expect(forge.lignes).toEqual([]);
    const ecrituresDeA = await avecEntreprise(entrepriseB, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.entrepriseId, entrepriseA)));
    expect(ecrituresDeA).toEqual([]);
    const comptes = await avecEntreprise(entrepriseB, (tx) => tx.select({ n: compteComptable.numero }).from(compteComptable).where(eq(compteComptable.numero, "603000")));
    expect(comptes).toHaveLength(1);
  });
});

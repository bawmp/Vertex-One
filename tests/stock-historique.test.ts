import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, produit, mouvementStock } from "@/db/schema";
import { activerSuiviStock, corrigerStock, decrementerStockVente, incrementerStockAchat } from "@/lib/produits/stock";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * Historique du stock (2026-11-02) : chaque variation laisse une ligne, les corrections manuelles respectent leurs garde-fous
 * (retrait plafonné au stock, motif de la liste fermée, produit suivi uniquement), et une entreprise ne peut ni corriger ni lire
 * le stock d'une autre.
 */
describe("Stock — historique des mouvements et corrections", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Stock Historique A ${suffixe}`;
  const nomB = `TEST Stock Historique B ${suffixe}`;
  let entrepriseA: string;
  let entrepriseB: string;
  let utilisateurA: string;
  let utilisateurB: string;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseA = a.id;
    entrepriseB = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: entrepriseA, email: `stock-a-${suffixe}@vertexone.test`, nomComplet: "Admin Stock A", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [ub] = await db.insert(utilisateur).values({ entrepriseId: entrepriseB, email: `stock-b-${suffixe}@vertexone.test`, nomComplet: "Admin Stock B", role: "ADMIN" }).returning({ id: utilisateur.id });
    utilisateurA = ua.id;
    utilisateurB = ub.id;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  async function nouveauProduit(entrepriseId: string, utilisateurId: string, valeurs: Partial<typeof produit.$inferInsert> = {}) {
    const [p] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(produit).values({ entrepriseId, type: "BIEN", nom: "Article test", suiviStock: true, stockActuel: 10, creeParId: utilisateurId, ...valeurs }).returning({ id: produit.id })
    );
    return p.id;
  }

  const lire = (entrepriseId: string, produitId: string) =>
    avecEntreprise(entrepriseId, async (tx) => ({
      produit: (await tx.select().from(produit).where(eq(produit.id, produitId)))[0],
      mouvements: await tx.select().from(mouvementStock).where(eq(mouvementStock.produitId, produitId)).orderBy(mouvementStock.creeLe),
    }));

  test("une vente et un achat laissent une ligne avec la quantité signée, le stock obtenu et le document", async () => {
    const id = await nouveauProduit(entrepriseA, utilisateurA);
    await avecEntreprise(entrepriseA, (tx) => decrementerStockVente(tx, entrepriseA, [{ produitId: id, quantite: 4 }], { documentType: "FACTURE", documentId: "fac-test", utilisateurId: utilisateurA }));
    await avecEntreprise(entrepriseA, (tx) => incrementerStockAchat(tx, entrepriseA, [{ produitId: id, quantite: 7 }], { documentType: "FACTURE_FOURNISSEUR", documentId: "ff-test" }));

    const { produit: p, mouvements } = await lire(entrepriseA, id);
    expect(p.stockActuel).toBe(13);
    expect(mouvements.map((m) => [m.type, m.quantite, m.stockApres])).toEqual([
      ["VENTE", -4, 6],
      ["ACHAT", 7, 13],
    ]);
    expect(mouvements[0].documentType).toBe("FACTURE");
    expect(mouvements[0].creeParId).toBe(utilisateurA);
    expect(mouvements[1].creeParId).toBeNull();
  });

  test("un produit non suivi ou un service ne laisse aucune ligne", async () => {
    const nonSuivi = await nouveauProduit(entrepriseA, utilisateurA, { suiviStock: false, stockActuel: 0 });
    await avecEntreprise(entrepriseA, (tx) => decrementerStockVente(tx, entrepriseA, [{ produitId: nonSuivi, quantite: 2 }]));
    expect((await lire(entrepriseA, nonSuivi)).mouvements).toHaveLength(0);
  });

  test("entrée et sortie manuelles : motif obligatoire dans la liste, retrait plafonné au stock", async () => {
    const id = await nouveauProduit(entrepriseA, utilisateurA, { stockActuel: 5 });

    const ajout = await avecEntreprise(entrepriseA, (tx) => corrigerStock(tx, entrepriseA, id, { mode: "AJOUT", quantite: 3, motif: "RECEPTION" }, utilisateurA));
    expect(ajout).toMatchObject({ ok: true, stockAvant: 5, stockApres: 8, ecart: 3 });

    const retrait = await avecEntreprise(entrepriseA, (tx) => corrigerStock(tx, entrepriseA, id, { mode: "RETRAIT", quantite: 2, motif: "CASSE", note: "tombé du rayon" }, utilisateurA));
    expect(retrait).toMatchObject({ ok: true, stockApres: 6 });

    const tropGros = await avecEntreprise(entrepriseA, (tx) => corrigerStock(tx, entrepriseA, id, { mode: "RETRAIT", quantite: 7, motif: "VOL" }, utilisateurA));
    expect(tropGros.ok).toBe(false);
    const motifInconnu = await avecEntreprise(entrepriseA, (tx) => corrigerStock(tx, entrepriseA, id, { mode: "AJOUT", quantite: 1, motif: "CADEAU" }, utilisateurA));
    expect(motifInconnu.ok).toBe(false);
    // Un motif de retrait n'est pas accepté pour une entrée.
    const motifCroise = await avecEntreprise(entrepriseA, (tx) => corrigerStock(tx, entrepriseA, id, { mode: "AJOUT", quantite: 1, motif: "VOL" }, utilisateurA));
    expect(motifCroise.ok).toBe(false);
    const zero = await avecEntreprise(entrepriseA, (tx) => corrigerStock(tx, entrepriseA, id, { mode: "AJOUT", quantite: 0, motif: "RECEPTION" }, utilisateurA));
    expect(zero.ok).toBe(false);

    const { produit: p, mouvements } = await lire(entrepriseA, id);
    expect(p.stockActuel).toBe(6);
    expect(mouvements.map((m) => [m.type, m.quantite, m.stockApres, m.motif])).toEqual([
      ["AJOUT", 3, 8, "RECEPTION"],
      ["RETRAIT", -2, 6, "CASSE"],
    ]);
    expect(mouvements[1].note).toBe("tombé du rayon");
  });

  test("inventaire : on saisit le compté, l'écart se calcule, zéro autorisé, négatif refusé, écart nul sans ligne", async () => {
    const id = await nouveauProduit(entrepriseA, utilisateurA, { stockActuel: 10 });

    const moins = await avecEntreprise(entrepriseA, (tx) => corrigerStock(tx, entrepriseA, id, { mode: "INVENTAIRE", compte: 8 }, utilisateurA));
    expect(moins).toMatchObject({ ok: true, stockAvant: 10, stockApres: 8, ecart: -2 });
    const identique = await avecEntreprise(entrepriseA, (tx) => corrigerStock(tx, entrepriseA, id, { mode: "INVENTAIRE", compte: 8 }, utilisateurA));
    expect(identique).toMatchObject({ ok: true, ecart: 0 });
    const zero = await avecEntreprise(entrepriseA, (tx) => corrigerStock(tx, entrepriseA, id, { mode: "INVENTAIRE", compte: 0 }, utilisateurA));
    expect(zero).toMatchObject({ ok: true, stockApres: 0 });
    const negatif = await avecEntreprise(entrepriseA, (tx) => corrigerStock(tx, entrepriseA, id, { mode: "INVENTAIRE", compte: -3 }, utilisateurA));
    expect(negatif.ok).toBe(false);

    const { mouvements } = await lire(entrepriseA, id);
    expect(mouvements.map((m) => [m.type, m.quantite, m.stockApres])).toEqual([
      ["INVENTAIRE", -2, 8],
      ["INVENTAIRE", -8, 0],
    ]);
  });

  test("activer le suivi enregistre le stock de départ ; refusé pour un service ou un produit déjà suivi", async () => {
    const id = await nouveauProduit(entrepriseA, utilisateurA, { suiviStock: false, stockActuel: 0 });
    const ok = await avecEntreprise(entrepriseA, (tx) => activerSuiviStock(tx, entrepriseA, id, 25, utilisateurA));
    expect(ok).toMatchObject({ ok: true, stockApres: 25 });
    const { produit: p, mouvements } = await lire(entrepriseA, id);
    expect(p.suiviStock).toBe(true);
    expect(p.stockActuel).toBe(25);
    expect(mouvements.map((m) => [m.type, m.quantite, m.stockApres])).toEqual([["INITIAL", 25, 25]]);

    expect((await avecEntreprise(entrepriseA, (tx) => activerSuiviStock(tx, entrepriseA, id, 5, utilisateurA))).ok).toBe(false);
    const service = await nouveauProduit(entrepriseA, utilisateurA, { type: "SERVICE", suiviStock: false, stockActuel: 0 });
    expect((await avecEntreprise(entrepriseA, (tx) => activerSuiviStock(tx, entrepriseA, service, 5, utilisateurA))).ok).toBe(false);
    const nonSuivi = await nouveauProduit(entrepriseA, utilisateurA, { suiviStock: false, stockActuel: 0 });
    expect((await avecEntreprise(entrepriseA, (tx) => corrigerStock(tx, entrepriseA, nonSuivi, { mode: "AJOUT", quantite: 1, motif: "RECEPTION" }, utilisateurA))).ok).toBe(false);
  });

  test("fuite entre entreprises : B ne peut ni corriger ni lire le stock de A", async () => {
    const id = await nouveauProduit(entrepriseA, utilisateurA, { stockActuel: 12 });
    await avecEntreprise(entrepriseA, (tx) => corrigerStock(tx, entrepriseA, id, { mode: "AJOUT", quantite: 1, motif: "RECEPTION" }, utilisateurA));

    // B tente de corriger le produit de A, avec son propre entrepriseId de session.
    const tentative = await avecEntreprise(entrepriseB, (tx) => corrigerStock(tx, entrepriseB, id, { mode: "RETRAIT", quantite: 5, motif: "VOL" }, utilisateurB));
    expect(tentative.ok).toBe(false);
    const activation = await avecEntreprise(entrepriseB, (tx) => activerSuiviStock(tx, entrepriseB, id, 99, utilisateurB));
    expect(activation.ok).toBe(false);

    // B ne voit aucune ligne d'historique de A, même en demandant son identifiant de produit.
    const vuParB = await avecEntreprise(entrepriseB, (tx) => tx.select().from(mouvementStock).where(eq(mouvementStock.produitId, id)));
    expect(vuParB).toHaveLength(0);
    // Et B ne peut pas écrire une ligne au nom de A.
    await expect(
      avecEntreprise(entrepriseB, (tx) => tx.insert(mouvementStock).values({ entrepriseId: entrepriseA, produitId: id, type: "AJOUT", quantite: 1, stockApres: 99 }))
    ).rejects.toThrow();

    const { produit: p } = await lire(entrepriseA, id);
    expect(p.stockActuel).toBe(13);
  });
});

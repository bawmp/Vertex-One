import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, produit } from "@/db/schema";
import { decrementerStockVente, incrementerStockAchat } from "@/lib/produits/stock";

/**
 * Vérifie le mouvement de stock d'une vente (catalogue Produits/Tarifs,
 * échange du 2026-09-07, zoho-books-full-spec.md section 5.3) : seul un
 * BIEN avec suiviStock actif est affecté, jamais un SERVICE ni un BIEN non
 * suivi, et deux lignes du même produit dans une même vente se cumulent.
 */
describe("Produits — mouvement de stock à la vente", () => {
  let entrepriseId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Stock Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, (tx) => tx.delete(produit).where(eq(produit.entrepriseId, entrepriseId)));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("un BIEN avec suiviStock voit son stock diminuer du total vendu, cumulé sur plusieurs lignes", async () => {
    const [leProduit] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(produit).values({ entrepriseId, type: "BIEN", nom: "Casque audio", suiviStock: true, stockActuel: 50 }).returning({ id: produit.id })
    );

    await avecEntreprise(entrepriseId, (tx) =>
      decrementerStockVente(tx, [
        { produitId: leProduit.id, quantite: 3 },
        { produitId: leProduit.id, quantite: 2 },
      ])
    );

    const [apres] = await avecEntreprise(entrepriseId, (tx) => tx.select({ stockActuel: produit.stockActuel }).from(produit).where(eq(produit.id, leProduit.id)));
    expect(apres.stockActuel).toBe(45);
  });

  test("un SERVICE et un BIEN non suivi ne sont jamais affectés", async () => {
    const [leService] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(produit).values({ entrepriseId, type: "SERVICE", nom: "Consultation" }).returning({ id: produit.id })
    );
    const [leBienNonSuivi] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(produit).values({ entrepriseId, type: "BIEN", nom: "Fourniture diverse", suiviStock: false, stockActuel: 0 }).returning({ id: produit.id })
    );

    await avecEntreprise(entrepriseId, (tx) =>
      decrementerStockVente(tx, [
        { produitId: leService.id, quantite: 1 },
        { produitId: leBienNonSuivi.id, quantite: 1 },
      ])
    );

    const [service, bienNonSuivi] = await avecEntreprise(entrepriseId, (tx) =>
      tx.select({ id: produit.id, stockActuel: produit.stockActuel }).from(produit)
    ).then((lignes) => [lignes.find((l) => l.id === leService.id), lignes.find((l) => l.id === leBienNonSuivi.id)]);
    expect(service?.stockActuel).toBe(0);
    expect(bienNonSuivi?.stockActuel).toBe(0);
  });

  test("une facture fournisseur pour un BIEN suivi augmente le stock (mouvement inverse)", async () => {
    const [leProduit] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(produit).values({ entrepriseId, type: "BIEN", nom: "Écran 24 pouces", suiviStock: true, stockActuel: 5 }).returning({ id: produit.id })
    );

    await avecEntreprise(entrepriseId, (tx) => incrementerStockAchat(tx, [{ produitId: leProduit.id, quantite: 8 }]));

    const [apres] = await avecEntreprise(entrepriseId, (tx) => tx.select({ stockActuel: produit.stockActuel }).from(produit).where(eq(produit.id, leProduit.id)));
    expect(apres.stockActuel).toBe(13);
  });

  test("une ligne sans produit (texte libre) ne fait planter aucun mouvement de stock", async () => {
    await expect(avecEntreprise(entrepriseId, (tx) => decrementerStockVente(tx, [{ produitId: null, quantite: 2 }]))).resolves.not.toThrow();
  });
});

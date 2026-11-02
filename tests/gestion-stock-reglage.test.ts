import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, produit, utilisateur } from "@/db/schema";
import { gestionStockActive, modifierGestionStock } from "@/lib/produits/gestion-stock";
import { activerSuiviStock } from "@/lib/produits/stock";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

describe("Entreprise de produits ou de services — réglage de la gestion de stock", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Reglage Stock A ${suffixe}`;
  const nomB = `TEST Reglage Stock B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: A, email: `reglage-a-${suffixe}@vertexone.test`, nomComplet: "Admin Reglage A", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = ua.id;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  test("une entreprise de services n'a pas le stock par défaut, une entreprise de commerce l'a", async () => {
    expect(await avecEntreprise(A, (tx) => gestionStockActive(tx, A))).toBe(false);
    expect(await avecEntreprise(B, (tx) => gestionStockActive(tx, B))).toBe(true);
  });

  test("activer ne touche que son entreprise", async () => {
    expect(await avecEntreprise(A, (tx) => modifierGestionStock(tx, A, true))).toEqual({ ok: true, active: true });
    expect(await avecEntreprise(A, (tx) => gestionStockActive(tx, A))).toBe(true);
    // Désactiver B (qui n'a aucun produit suivi) ne change rien pour A.
    expect(await avecEntreprise(B, (tx) => modifierGestionStock(tx, B, false))).toEqual({ ok: true, active: false });
    expect(await avecEntreprise(A, (tx) => gestionStockActive(tx, A))).toBe(true);
    expect(await avecEntreprise(B, (tx) => gestionStockActive(tx, B))).toBe(false);
  });

  test("on ne peut pas désactiver tant qu'un produit est suivi en stock", async () => {
    const [p] = await avecEntreprise(A, (tx) => tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom: "Article réglage", prixAchat: 50, creeParId: uA }).returning({ id: produit.id }));
    await avecEntreprise(A, (tx) => activerSuiviStock(tx, A, p.id, 3, uA));
    const refus = await avecEntreprise(A, (tx) => modifierGestionStock(tx, A, false));
    expect(refus.ok).toBe(false);
    expect(await avecEntreprise(A, (tx) => gestionStockActive(tx, A))).toBe(true);
    // Un produit suivi d'une autre entreprise ne bloque pas non plus la désactivation de B (B est déjà désactivée : on la réactive puis désactive).
    expect(await avecEntreprise(B, (tx) => modifierGestionStock(tx, B, true))).toMatchObject({ ok: true });
    expect(await avecEntreprise(B, (tx) => modifierGestionStock(tx, B, false))).toMatchObject({ ok: true });
  });

  test("entreprise inconnue : refus propre", async () => {
    expect((await avecEntreprise(A, (tx) => modifierGestionStock(tx, "inexistante", true))).ok).toBe(false);
    expect(await avecEntreprise(A, (tx) => gestionStockActive(tx, "inexistante"))).toBe(false);
    const [lu] = await db.select({ g: entreprise.gereStock }).from(entreprise).where(eq(entreprise.id, A));
    expect(lu.g).toBe(true);
  });
});

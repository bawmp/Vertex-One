import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, mouvementStock, produit, stockDepot, utilisateur } from "@/db/schema";
import { creerDepot, listerDepots, stockParDepot, transfererStock } from "@/lib/produits/depots";
import { blocageRuptureActif, modifierBlocageRupture, modifierGestionStock } from "@/lib/produits/gestion-stock";
import { activerSuiviStock, arreterSuiviStock, decrementerStockVente, definirSeuilAlerte, verifierStockSuffisant } from "@/lib/produits/stock";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * Priorités 1.4 et 1.5 : interdire la vente en rupture (réglage par entreprise, contrôle par dépôt) et arrêter le suivi du stock d'un
 * produit (le reste sort du suivi, l'historique le garde, les documents ne le touchent plus).
 */
describe("Vente en rupture et arrêt du suivi", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Rupture A ${suffixe}`;
  const nomB = `TEST Rupture B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let uB: string;
  let principal: string;
  let boutique: string;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: A, email: `rupture-a-${suffixe}@vertexone.test`, nomComplet: "Admin Rupture A", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [ub] = await db.insert(utilisateur).values({ entrepriseId: B, email: `rupture-b-${suffixe}@vertexone.test`, nomComplet: "Admin Rupture B", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = ua.id;
    uB = ub.id;
    await avecEntreprise(A, (tx) => creerDepot(tx, A, "Boutique rupture"));
    const depots = await avecEntreprise(A, (tx) => listerDepots(tx, A));
    principal = depots.find((d) => d.principal)!.id;
    boutique = depots.find((d) => !d.principal)!.id;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const nouveau = async (stock: number, nom = "Article rupture") => {
    const [p] = await avecEntreprise(A, (tx) => tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom, prixAchat: 100, creeParId: uA }).returning({ id: produit.id }));
    await avecEntreprise(A, (tx) => activerSuiviStock(tx, A, p.id, stock, uA));
    return p.id;
  };

  test("réglage : sans l'option, jamais de blocage ; l'option exige la gestion de stock", async () => {
    const id = await nouveau(2);
    expect(await avecEntreprise(A, (tx) => blocageRuptureActif(tx, A))).toBe(false);
    expect(await avecEntreprise(A, (tx) => verifierStockSuffisant(tx, A, [{ produitId: id, quantite: 99 }]))).toBeNull(); // tolérance d'avant

    expect(await avecEntreprise(A, (tx) => modifierBlocageRupture(tx, A, true))).toEqual({ ok: true, bloquer: true });
    expect(await avecEntreprise(A, (tx) => blocageRuptureActif(tx, A))).toBe(true);
    // Une entreprise de services ne peut pas activer l'option.
    const [c] = await db.insert(entreprise).values({ nom: `TEST Rupture C ${suffixe}`, secteurProfil: "agence" }).returning({ id: entreprise.id });
    try {
      expect((await avecEntreprise(c.id, (tx) => modifierBlocageRupture(tx, c.id, true))).ok).toBe(false);
    } finally {
      await supprimerEntrepriseDeTest(`TEST Rupture C ${suffixe}`);
    }
  }, 180_000);

  test("avec l'option : refus quand le stock manque, message précis, produits non suivis et services jamais bloqués", async () => {
    const id = await nouveau(5, "Sac de riz");
    const manque = await avecEntreprise(A, (tx) => verifierStockSuffisant(tx, A, [{ produitId: id, quantite: 6 }]));
    expect(manque).not.toBeNull();
    expect(manque?.valeurs).toEqual({ produit: "Sac de riz", depot: "Dépôt principal", disponible: 5, demande: 6 });
    expect(await avecEntreprise(A, (tx) => verifierStockSuffisant(tx, A, [{ produitId: id, quantite: 5 }]))).toBeNull(); // pile ce qu'il y a
    // Deux lignes du même produit se cumulent.
    expect(await avecEntreprise(A, (tx) => verifierStockSuffisant(tx, A, [{ produitId: id, quantite: 3 }, { produitId: id, quantite: 3 }]))).not.toBeNull();

    // Un service (pas de produit) et un produit non suivi ne sont jamais bloqués.
    const [nonSuivi] = await avecEntreprise(A, (tx) => tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom: "Non suivi", creeParId: uA }).returning({ id: produit.id }));
    expect(await avecEntreprise(A, (tx) => verifierStockSuffisant(tx, A, [{ produitId: null, quantite: 50 }, { produitId: nonSuivi.id, quantite: 50 }]))).toBeNull();
  });

  test("le contrôle se fait sur le dépôt visé, pas sur le total", async () => {
    const id = await nouveau(10, "Huile");
    await avecEntreprise(A, (tx) => transfererStock(tx, A, id, principal, boutique, 4, uA)); // principal 6, boutique 4
    expect(await avecEntreprise(A, (tx) => verifierStockSuffisant(tx, A, [{ produitId: id, quantite: 5 }], boutique))).not.toBeNull(); // la boutique n'en a que 4
    expect(await avecEntreprise(A, (tx) => verifierStockSuffisant(tx, A, [{ produitId: id, quantite: 4 }], boutique))).toBeNull();
    expect(await avecEntreprise(A, (tx) => verifierStockSuffisant(tx, A, [{ produitId: id, quantite: 6 }]))).toBeNull(); // dépôt principal
    expect(await avecEntreprise(A, (tx) => verifierStockSuffisant(tx, A, [{ produitId: id, quantite: 7 }]))).not.toBeNull();
  });

  test("l'option de A ne s'applique jamais à B", async () => {
    const [p] = await avecEntreprise(B, (tx) => tx.insert(produit).values({ entrepriseId: B, type: "BIEN", nom: "Article B", creeParId: uB }).returning({ id: produit.id }));
    await avecEntreprise(B, (tx) => activerSuiviStock(tx, B, p.id, 1, uB));
    expect(await avecEntreprise(B, (tx) => blocageRuptureActif(tx, B))).toBe(false);
    expect(await avecEntreprise(B, (tx) => verifierStockSuffisant(tx, B, [{ produitId: p.id, quantite: 10 }]))).toBeNull();
    expect(await avecEntreprise(A, (tx) => blocageRuptureActif(tx, A))).toBe(true);
  });

  test("arrêt du suivi : le reste sort du suivi dépôt par dépôt, seuil retiré, plus aucun mouvement ensuite", async () => {
    const id = await nouveau(10, "Produit à arrêter");
    await avecEntreprise(A, (tx) => transfererStock(tx, A, id, principal, boutique, 4, uA)); // principal 6, boutique 4
    await avecEntreprise(A, (tx) => definirSeuilAlerte(tx, A, id, 3));

    const r = await avecEntreprise(A, (tx) => arreterSuiviStock(tx, A, id, uA));
    expect(r).toEqual({ ok: true, retires: 10 });
    const [p] = await avecEntreprise(A, (tx) => tx.select().from(produit).where(eq(produit.id, id)));
    expect(p).toMatchObject({ suiviStock: false, stockActuel: 0, seuilAlerte: null });
    expect(await avecEntreprise(A, (tx) => tx.select().from(stockDepot).where(eq(stockDepot.produitId, id)))).toEqual([]);

    const fin = (await avecEntreprise(A, (tx) => tx.select().from(mouvementStock).where(eq(mouvementStock.produitId, id)))).filter((m) => m.motif === "FIN_SUIVI");
    expect(fin.map((m) => m.quantite).sort((a, b) => a - b)).toEqual([-6, -4]);
    expect(fin.map((m) => m.stockApres).sort((a, b) => a - b)).toEqual([0, 4]);

    // Les ventes ne le touchent plus ; on peut re-suivre le produit.
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: id, quantite: 3 }], { documentType: "FACTURE", documentId: "fac-fin" }));
    expect((await avecEntreprise(A, (tx) => tx.select({ s: produit.stockActuel }).from(produit).where(eq(produit.id, id))))[0].s).toBe(0);
    expect((await avecEntreprise(A, (tx) => activerSuiviStock(tx, A, id, 7, uA))).ok).toBe(true);
    expect(Object.values(Object.fromEntries((await avecEntreprise(A, (tx) => stockParDepot(tx, A, id))).map((d) => [d.nom, d.quantite]))).reduce((s, q) => s + q, 0)).toBe(7);
  });

  test("garde-fous de l'arrêt : produit non suivi refusé, et B ne peut pas arrêter le suivi d'un produit de A", async () => {
    const id = await nouveau(2, "Protégé");
    expect((await avecEntreprise(B, (tx) => arreterSuiviStock(tx, B, id, uB))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => tx.select({ suivi: produit.suiviStock }).from(produit).where(eq(produit.id, id))))[0].suivi).toBe(true);
    expect((await avecEntreprise(A, (tx) => arreterSuiviStock(tx, A, id, uA))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => arreterSuiviStock(tx, A, id, uA))).ok).toBe(false); // déjà arrêté
  });

  test("une fois tous les suivis arrêtés, la gestion de stock peut se désactiver", async () => {
    const [d] = await db.insert(entreprise).values({ nom: `TEST Rupture D ${suffixe}`, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    try {
      const [u] = await db.insert(utilisateur).values({ entrepriseId: d.id, email: `rupture-d-${suffixe}@vertexone.test`, nomComplet: "Admin Rupture D", role: "ADMIN" }).returning({ id: utilisateur.id });
      const [p] = await avecEntreprise(d.id, (tx) => tx.insert(produit).values({ entrepriseId: d.id, type: "BIEN", nom: "Seul produit", creeParId: u.id }).returning({ id: produit.id }));
      await avecEntreprise(d.id, (tx) => activerSuiviStock(tx, d.id, p.id, 3, u.id));
      expect((await avecEntreprise(d.id, (tx) => modifierGestionStock(tx, d.id, false))).ok).toBe(false);
      await avecEntreprise(d.id, (tx) => arreterSuiviStock(tx, d.id, p.id, u.id));
      expect(await avecEntreprise(d.id, (tx) => modifierGestionStock(tx, d.id, false))).toEqual({ ok: true, active: false });
    } finally {
      await supprimerEntrepriseDeTest(`TEST Rupture D ${suffixe}`);
    }
  }, 180_000);
});

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { bonCommandeVente, contact, entreprise, ligneBonCommandeVente, mouvementStock, produit, stockDepot, utilisateur } from "@/db/schema";
import { coutDuKit, etendreLignes, kitsDisponibles, quantiteComposantValide } from "@/lib/produits/kits-regles";
import { ajouterComposant, creerKit, estComposant, lireKit, retirerComposant } from "@/lib/produits/kits";
import { activerSuiviStock, decrementerStockVente, incrementerStockAchat, verifierStockSuffisant } from "@/lib/produits/stock";
import { commandesQuiReservent, reservesParProduit } from "@/lib/produits/reservations";
import { assurerDepotPrincipal } from "@/lib/produits/depots";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Priorité 3.9 : kits et nomenclatures — un kit n'a pas de stock, sa vente sort celui de ses composants. */
describe("Kits — règles pures", () => {
  test("kits vendables : le composant le plus rare décide, un stock négatif compte pour zéro", () => {
    expect(kitsDisponibles([{ stockActuel: 20, quantite: 2 }, { stockActuel: 9, quantite: 1 }])).toBe(9);
    expect(kitsDisponibles([{ stockActuel: 7, quantite: 2 }, { stockActuel: 50, quantite: 1 }])).toBe(3);
    expect(kitsDisponibles([{ stockActuel: -4, quantite: 1 }, { stockActuel: 50, quantite: 1 }])).toBe(0);
    expect(kitsDisponibles([])).toBe(0);
  });

  test("coût de revient : somme des coûts moyens × quantités", () => {
    expect(coutDuKit([{ coutMoyen: 500, quantite: 2 }, { coutMoyen: 1500, quantite: 1 }])).toBe(2500);
    expect(coutDuKit([])).toBe(0);
  });

  test("expansion des lignes : un kit devient ses composants (quantité × quantité), le reste ne bouge pas", () => {
    const compositions = new Map([["kit", [{ composantId: "a", quantite: 2 }, { composantId: "b", quantite: 1 }]]]);
    const lignes = [{ produitId: "kit", quantite: 3, prixUnitaire: 6000 }, { produitId: "a", quantite: 1 }, { produitId: null, quantite: 5 }];
    expect(etendreLignes(lignes, compositions)).toEqual([
      { produitId: "a", quantite: 6, prixUnitaire: undefined },
      { produitId: "b", quantite: 3, prixUnitaire: undefined },
      { produitId: "a", quantite: 1 },
      { produitId: null, quantite: 5 },
    ]);
  });

  test("quantité de composant : entier de 1 à 10 000", () => {
    expect(quantiteComposantValide(1)).toBe(true);
    expect(quantiteComposantValide(10_000)).toBe(true);
    expect(quantiteComposantValide(0)).toBe(false);
    expect(quantiteComposantValide(1.5)).toBe(false);
    expect(quantiteComposantValide(10_001)).toBe(false);
  });
});

describe("Kits — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Kits A ${suffixe}`;
  const nomB = `TEST Kits B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let uB: string;
  let client = "";
  const ids: Record<string, string> = {};

  const stock = async (id: string) => (await avecEntreprise(A, (tx) => tx.select({ s: produit.stockActuel }).from(produit).where(eq(produit.id, id))))[0].s;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce", gereStock: true, bloquerVenteRupture: true }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [x] = await db.insert(utilisateur).values({ entrepriseId: A, email: `kit-a-${suffixe}@vertexone.test`, nomComplet: "Admin Kit A", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [y] = await db.insert(utilisateur).values({ entrepriseId: B, email: `kit-b-${suffixe}@vertexone.test`, nomComplet: "Admin Kit B", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = x.id;
    uB = y.id;
    await avecEntreprise(A, async (tx) => {
      const principal = (await assurerDepotPrincipal(tx, A)).id;
      const p = async (nom: string, valeurs: Partial<typeof produit.$inferInsert>) => {
        const [r] = await tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom, suiviStock: true, creeParId: uA, ...valeurs }).returning({ id: produit.id });
        if (valeurs.stockActuel) await tx.insert(stockDepot).values({ entrepriseId: A, produitId: r.id, depotId: principal, quantite: valeurs.stockActuel });
        return r.id;
      };
      ids.sav = await p("Savon", { stockActuel: 20, coutMoyen: 500 });
      ids.hui = await p("Huile", { stockActuel: 9, coutMoyen: 1500 });
      ids.service = await p("Emballage cadeau", { type: "SERVICE", suiviStock: false });
      ids.nonSuivi = await p("Ruban", { suiviStock: false });
      [{ id: client }] = await tx.insert(contact).values({ entrepriseId: A, nom: "Client Kit", telephone: "+237600000055", assigneAId: uA }).returning({ id: contact.id });
    });
    await avecEntreprise(B, async (tx) => {
      const [r] = await tx.insert(produit).values({ entrepriseId: B, type: "BIEN", nom: "Savon B", suiviStock: true, stockActuel: 5, creeParId: uB }).returning({ id: produit.id });
      ids.savB = r.id;
    });
  }, 120_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  test("créer un kit : produit sans stock, composition enregistrée, disponibilité et coût calculés", async () => {
    const r = await avecEntreprise(A, (tx) => creerKit(tx, A, uA, { nom: " Coffret  cadeau ", prixVente: 6000, composants: [{ produitId: ids.sav, quantite: 2 }, { produitId: ids.hui, quantite: 1 }] }));
    expect(r.ok).toBe(true);
    ids.kit = r.ok ? (r.id as string) : "";
    const [k] = await avecEntreprise(A, (tx) => tx.select({ nom: produit.nom, estKit: produit.estKit, suivi: produit.suiviStock, stock: produit.stockActuel, type: produit.type, achat: produit.prixAchat }).from(produit).where(eq(produit.id, ids.kit)));
    expect(k).toEqual({ nom: "Coffret cadeau", estKit: true, suivi: false, stock: 0, type: "BIEN", achat: 2500 });
    const vue = await avecEntreprise(A, (tx) => lireKit(tx, A, ids.kit));
    expect(vue).toMatchObject({ disponibles: 9, cout: 2500, prixVente: 6000 });
    expect(vue!.composants.map((c) => [c.nom, c.quantite])).toEqual([["Huile", 1], ["Savon", 2]]);
    expect(await avecEntreprise(A, (tx) => estComposant(tx, A, ids.sav))).toBe(true);
    expect(await avecEntreprise(A, (tx) => estComposant(tx, A, ids.kit))).toBe(false);
  }, 180_000);

  test("refus à la création : nom court, prix invalide, vide, doublon, quantité, service, non suivi, kit dans un kit, produit d'une autre entreprise", async () => {
    const essai = (k: Partial<Parameters<typeof creerKit>[3]>) => avecEntreprise(A, (tx) => creerKit(tx, A, uA, { nom: "Autre kit", prixVente: 1000, composants: [{ produitId: ids.sav, quantite: 1 }], ...k }));
    expect((await essai({ nom: "K" })).ok).toBe(false);
    expect((await essai({ prixVente: -5 })).ok).toBe(false);
    expect((await essai({ composants: [] })).ok).toBe(false);
    expect((await essai({ composants: [{ produitId: ids.sav, quantite: 1 }, { produitId: ids.sav, quantite: 2 }] })).ok).toBe(false);
    expect((await essai({ composants: [{ produitId: ids.sav, quantite: 0 }] })).ok).toBe(false);
    expect((await essai({ composants: [{ produitId: ids.service, quantite: 1 }] })).ok).toBe(false);
    expect((await essai({ composants: [{ produitId: ids.nonSuivi, quantite: 1 }] })).ok).toBe(false);
    expect((await essai({ composants: [{ produitId: ids.kit, quantite: 1 }] })).ok).toBe(false);
    expect((await essai({ composants: [{ produitId: ids.savB, quantite: 1 }] })).ok).toBe(false);
  }, 180_000);

  test("vendre un kit sort le stock des composants, jamais du kit ; un achat de kit n'entre rien", async () => {
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: ids.kit, quantite: 3, prixUnitaire: 6000 }]));
    expect(await stock(ids.sav)).toBe(14); // 20 − 3 × 2
    expect(await stock(ids.hui)).toBe(6); // 9 − 3 × 1
    expect(await stock(ids.kit)).toBe(0);
    const mouvements = await avecEntreprise(A, (tx) => tx.select({ produit: mouvementStock.produitId, q: mouvementStock.quantite, type: mouvementStock.type }).from(mouvementStock).where(and(eq(mouvementStock.entrepriseId, A), eq(mouvementStock.type, "VENTE"))).orderBy(asc(mouvementStock.quantite)));
    expect(mouvements).toEqual([{ produit: ids.sav, q: -6, type: "VENTE" }, { produit: ids.hui, q: -3, type: "VENTE" }]);

    await avecEntreprise(A, (tx) => incrementerStockAchat(tx, A, [{ produitId: ids.kit, quantite: 5, prixUnitaire: 1000 }]));
    expect(await stock(ids.sav)).toBe(14);
    expect(await stock(ids.hui)).toBe(6);
  }, 180_000);

  test("une vente mêlant un kit et l'un de ses composants cumule les quantités en un seul mouvement", async () => {
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: ids.kit, quantite: 1, prixUnitaire: 6000 }, { produitId: ids.sav, quantite: 1, prixUnitaire: 800 }]));
    expect(await stock(ids.sav)).toBe(11); // 14 − 2 − 1
    expect(await stock(ids.hui)).toBe(5);
    const savon = await avecEntreprise(A, (tx) => tx.select({ q: mouvementStock.quantite }).from(mouvementStock).where(and(eq(mouvementStock.produitId, ids.sav), eq(mouvementStock.type, "VENTE"))).orderBy(asc(mouvementStock.quantite)));
    expect(savon.map((s) => s.q)).toEqual([-6, -3]);
  }, 180_000);

  test("« interdire la vente en rupture » : un kit est refusé quand l'un de ses composants manque", async () => {
    // Stock : savon 11 (5 kits), huile 5 (5 kits) → au plus 5 kits.
    expect(await avecEntreprise(A, (tx) => verifierStockSuffisant(tx, A, [{ produitId: ids.kit, quantite: 5 }]))).toBeNull();
    const refus = await avecEntreprise(A, (tx) => verifierStockSuffisant(tx, A, [{ produitId: ids.kit, quantite: 6 }]));
    expect(refus).not.toBeNull();
    // 6 kits demandent 12 savons (11 en stock) et 6 huiles (5 en stock) : le premier composant en manque est signalé.
    expect(refus!.valeurs).toMatchObject({ produit: "Savon", disponible: 11, demande: 12 });
  }, 120_000);

  test("une commande client avec un kit réserve ses composants", async () => {
    await avecEntreprise(A, async (tx) => {
      const [bc] = await tx.insert(bonCommandeVente).values({ entrepriseId: A, numero: `BCV-K-${suffixe}`, contactId: client, assigneAId: uA, creeParId: uA, montantHT: 0, montantTTC: 0 }).returning({ id: bonCommandeVente.id });
      await tx.insert(ligneBonCommandeVente).values({ entrepriseId: A, bonCommandeVenteId: bc.id, produitId: ids.kit, designation: "Coffret", quantite: 2, prixUnitaire: 6000 });
    });
    const reserves = await avecEntreprise(A, (tx) => reservesParProduit(tx, A));
    expect(reserves.get(ids.sav)).toBe(4);
    expect(reserves.get(ids.hui)).toBe(2);
    expect(reserves.has(ids.kit)).toBe(false);
    const filtrees = await avecEntreprise(A, (tx) => reservesParProduit(tx, A, { produitIds: [ids.hui] }));
    expect([...filtrees.entries()]).toEqual([[ids.hui, 2]]);
    const cmds = await avecEntreprise(A, (tx) => commandesQuiReservent(tx, A, ids.sav));
    expect(cmds).toEqual([expect.objectContaining({ quantite: 4 })]);
    // Disponible huile : 5 − 2 = 3 → 4 kits refusés, 3 acceptés.
    expect(await avecEntreprise(A, (tx) => verifierStockSuffisant(tx, A, [{ produitId: ids.kit, quantite: 3 }]))).toBeNull();
    expect(await avecEntreprise(A, (tx) => verifierStockSuffisant(tx, A, [{ produitId: ids.kit, quantite: 4 }]))).not.toBeNull();
  }, 180_000);

  test("composition : ajouter, doublon, kit refusé, retirer, jamais le dernier ; un kit ne se met pas en suivi de stock", async () => {
    const [ruban] = await avecEntreprise(A, (tx) => tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom: "Carte", suiviStock: true, stockActuel: 30, creeParId: uA }).returning({ id: produit.id }));
    expect((await avecEntreprise(A, (tx) => ajouterComposant(tx, A, ids.kit, ruban.id, 1))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => ajouterComposant(tx, A, ids.kit, ruban.id, 1))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => ajouterComposant(tx, A, ids.kit, ids.kit, 1))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => ajouterComposant(tx, A, ids.kit, ids.sav, 1))).ok).toBe(false); // déjà dedans
    expect((await avecEntreprise(A, (tx) => retirerComposant(tx, A, ids.kit, ruban.id))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => retirerComposant(tx, A, ids.kit, ruban.id))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => retirerComposant(tx, A, ids.kit, ids.hui))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => retirerComposant(tx, A, ids.kit, ids.sav))).ok).toBe(false); // le dernier reste
    expect((await avecEntreprise(A, (tx) => activerSuiviStock(tx, A, ids.kit, 5, uA))).ok).toBe(false);
    expect(await stock(ids.kit)).toBe(0);
  }, 240_000);

  test("fuite entre entreprises : B ne voit pas le kit de A, ne le modifie pas, ne compose pas avec ses produits", async () => {
    expect(await avecEntreprise(B, (tx) => lireKit(tx, B, ids.kit))).toBeNull();
    expect((await avecEntreprise(B, (tx) => ajouterComposant(tx, B, ids.kit, ids.savB, 1))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => retirerComposant(tx, B, ids.kit, ids.sav))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => creerKit(tx, B, uB, { nom: "Kit pirate", prixVente: 1, composants: [{ produitId: ids.sav, quantite: 1 }] }))).ok).toBe(false);
    expect(await avecEntreprise(B, (tx) => estComposant(tx, B, ids.sav))).toBe(false);
    expect((await avecEntreprise(B, (tx) => reservesParProduit(tx, B))).size).toBe(0);
    const vue = await avecEntreprise(A, (tx) => lireKit(tx, A, ids.kit));
    expect(vue!.composants.map((c) => c.nom)).toEqual(["Savon"]);
  }, 180_000);
});

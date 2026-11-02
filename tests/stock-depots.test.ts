import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { depot, entreprise, mouvementStock, produit, stockDepot, utilisateur } from "@/db/schema";
import { archiverDepot, assurerDepotPrincipal, creerDepot, definirDepotPrincipal, listerDepots, renommerDepot, resorberEcart, stockParDepot, transfererStock } from "@/lib/produits/depots";
import { corrigerStock, decrementerStockVente, incrementerStockAchat } from "@/lib/produits/stock";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * Dépôts (2026-11-02) : le dépôt principal reçoit les documents, les transferts déplacent le stock sans changer le total, les
 * corrections et inventaires se mesurent sur leur dépôt, et une entreprise ne voit ni ne touche aux dépôts d'une autre.
 */
describe("Stock — dépôts", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Depots A ${suffixe}`;
  const nomB = `TEST Depots B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let uB: string;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: A, email: `depots-a-${suffixe}@vertexone.test`, nomComplet: "Admin Depots A", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [ub] = await db.insert(utilisateur).values({ entrepriseId: B, email: `depots-b-${suffixe}@vertexone.test`, nomComplet: "Admin Depots B", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = ua.id;
    uB = ub.id;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const nouveau = async (stock = 10) => {
    const [p] = await avecEntreprise(A, (tx) => tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom: "Article depots", suiviStock: true, stockActuel: stock, coutMoyen: 100, prixAchat: 100, creeParId: uA }).returning({ id: produit.id }));
    return p.id;
  };
  const repartition = (id: string) => avecEntreprise(A, async (tx) => Object.fromEntries((await stockParDepot(tx, A, id)).map((d) => [d.nom, d.quantite])));
  const total = async (id: string) => (await avecEntreprise(A, (tx) => tx.select({ s: produit.stockActuel }).from(produit).where(eq(produit.id, id))))[0].s;

  test("le dépôt principal existe toujours (créé à la demande), un seul, jamais en double", async () => {
    const [x, y] = await Promise.all([avecEntreprise(A, (tx) => assurerDepotPrincipal(tx, A)), avecEntreprise(A, (tx) => assurerDepotPrincipal(tx, A))]);
    expect(x.id).toBe(y.id);
    const depots = await avecEntreprise(A, (tx) => listerDepots(tx, A));
    expect(depots.filter((d) => d.principal)).toHaveLength(1);
  });

  test("un produit d'avant les dépôts retrouve tout son stock dans le dépôt principal", async () => {
    const id = await nouveau(12);
    expect(await repartition(id)).toEqual({ "Dépôt principal": 12 });
  });

  test("création, doublon et nom invalide", async () => {
    expect((await avecEntreprise(A, (tx) => creerDepot(tx, A, "  Boutique   Centre "))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => creerDepot(tx, A, "Boutique Centre"))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => creerDepot(tx, A, "x"))).ok).toBe(false);
    const noms = (await avecEntreprise(A, (tx) => listerDepots(tx, A))).map((d) => d.nom);
    expect(noms).toEqual(["Dépôt principal", "Boutique Centre"]);
  });

  test("les ventes et achats des documents vont au dépôt principal, le total reste cohérent", async () => {
    const id = await nouveau(10);
    await repartition(id);
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: id, quantite: 4 }]));
    await avecEntreprise(A, (tx) => incrementerStockAchat(tx, A, [{ produitId: id, quantite: 6, prixUnitaire: 100 }]));
    expect(await repartition(id)).toEqual({ "Dépôt principal": 12, "Boutique Centre": 0 });
    expect(await total(id)).toBe(12);
    const lignes = await avecEntreprise(A, (tx) => tx.select({ depotId: mouvementStock.depotId }).from(mouvementStock).where(eq(mouvementStock.produitId, id)));
    expect(lignes.every((l) => l.depotId !== null)).toBe(true);
  });

  test("transfert : le total ne change pas, deux lignes d'historique, plafond au contenu du dépôt de départ", async () => {
    const id = await nouveau(20);
    const depots = await avecEntreprise(A, (tx) => listerDepots(tx, A));
    const principal = depots.find((d) => d.principal)!;
    const boutique = depots.find((d) => !d.principal)!;

    const ok = await avecEntreprise(A, (tx) => transfererStock(tx, A, id, principal.id, boutique.id, 8, uA, "pour le week-end"));
    expect(ok).toMatchObject({ ok: true, quantite: 8, depuis: "Dépôt principal", vers: "Boutique Centre" });
    expect(await repartition(id)).toEqual({ "Dépôt principal": 12, "Boutique Centre": 8 });
    expect(await total(id)).toBe(20);

    const lignes = await avecEntreprise(A, (tx) => tx.select().from(mouvementStock).where(eq(mouvementStock.produitId, id)).orderBy(mouvementStock.type));
    const transferts = lignes.filter((l) => l.type === "TRANSFERT_SORTIE" || l.type === "TRANSFERT_ENTREE");
    expect(transferts.map((l) => [l.type, l.quantite, l.depotId === principal.id ? "principal" : "boutique"]).sort()).toEqual([
      ["TRANSFERT_ENTREE", 8, "boutique"],
      ["TRANSFERT_SORTIE", -8, "principal"],
    ]);
    expect(transferts.every((l) => l.stockApres === 20 && l.note?.includes("pour le week-end"))).toBe(true);

    expect((await avecEntreprise(A, (tx) => transfererStock(tx, A, id, boutique.id, principal.id, 9, uA))).ok).toBe(false); // il n'y en a que 8
    expect((await avecEntreprise(A, (tx) => transfererStock(tx, A, id, boutique.id, boutique.id, 1, uA))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => transfererStock(tx, A, id, boutique.id, principal.id, 0, uA))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => transfererStock(tx, A, id, boutique.id, principal.id, 2.5, uA))).ok).toBe(false);
    expect(await repartition(id)).toEqual({ "Dépôt principal": 12, "Boutique Centre": 8 });
  });

  test("corrections et inventaire se mesurent sur le dépôt visé", async () => {
    const id = await nouveau(10);
    const depots = await avecEntreprise(A, (tx) => listerDepots(tx, A));
    const boutique = depots.find((d) => !d.principal)!;
    const principal = depots.find((d) => d.principal)!;
    await avecEntreprise(A, (tx) => transfererStock(tx, A, id, principal.id, boutique.id, 3, uA));

    // Retrait de 5 dans la boutique (qui n'en a que 3) : refusé ; de 2 : accepté.
    expect((await avecEntreprise(A, (tx) => corrigerStock(tx, A, id, { mode: "RETRAIT", quantite: 5, motif: "CASSE", depotId: boutique.id }, uA))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => corrigerStock(tx, A, id, { mode: "RETRAIT", quantite: 2, motif: "CASSE", depotId: boutique.id }, uA))).ok).toBe(true);
    expect(await repartition(id)).toEqual({ "Dépôt principal": 7, "Boutique Centre": 1 });

    // Inventaire de la boutique : 4 comptés, 1 dans le système → +3 ; le dépôt principal est intact.
    const inv = await avecEntreprise(A, (tx) => corrigerStock(tx, A, id, { mode: "INVENTAIRE", compte: 4, depotId: boutique.id }, uA));
    expect(inv).toMatchObject({ ok: true, ecart: 3 });
    expect(await repartition(id)).toEqual({ "Dépôt principal": 7, "Boutique Centre": 4 });
    expect(await total(id)).toBe(11);
    const dernier = (await avecEntreprise(A, (tx) => tx.select().from(mouvementStock).where(eq(mouvementStock.produitId, id)).orderBy(mouvementStock.creeLe))).at(-1)!;
    expect(dernier).toMatchObject({ type: "INVENTAIRE", quantite: 3, depotId: boutique.id });
  });

  test("renommer, changer de dépôt principal (jamais deux), archiver seulement un dépôt vide non principal", async () => {
    const depots = await avecEntreprise(A, (tx) => listerDepots(tx, A));
    const principal = depots.find((d) => d.principal)!;
    const boutique = depots.find((d) => !d.principal)!;
    expect((await avecEntreprise(A, (tx) => renommerDepot(tx, A, boutique.id, "Dépôt principal"))).ok).toBe(false); // nom déjà pris
    expect((await avecEntreprise(A, (tx) => renommerDepot(tx, A, boutique.id, "Boutique Akwa"))).ok).toBe(true);

    expect((await avecEntreprise(A, (tx) => archiverDepot(tx, A, principal.id))).ok).toBe(false); // principal
    expect((await avecEntreprise(A, (tx) => archiverDepot(tx, A, boutique.id))).ok).toBe(false); // contient du stock

    expect((await avecEntreprise(A, (tx) => definirDepotPrincipal(tx, A, boutique.id))).ok).toBe(true);
    const apres = await avecEntreprise(A, (tx) => listerDepots(tx, A));
    expect(apres.filter((d) => d.principal).map((d) => d.nom)).toEqual(["Boutique Akwa"]);

    // Un nouveau dépôt vide s'archive ; il n'apparaît plus dans la liste active.
    const extra = await avecEntreprise(A, (tx) => creerDepot(tx, A, "Entrepôt temporaire"));
    if (!extra.ok || !extra.id) throw new Error("création du dépôt temporaire refusée");
    const extraId = extra.id;
    expect((await avecEntreprise(A, (tx) => archiverDepot(tx, A, extraId))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => listerDepots(tx, A))).map((d) => d.nom)).not.toContain("Entrepôt temporaire");
    expect((await avecEntreprise(A, (tx) => definirDepotPrincipal(tx, A, extraId))).ok).toBe(false); // archivé
  });

  test("un écart entre le total et les dépôts se résorbe sur le dépôt principal", async () => {
    const id = await nouveau(5);
    await avecEntreprise(A, (tx) => resorberEcart(tx, A, id));
    await avecEntreprise(A, (tx) => tx.update(produit).set({ stockActuel: 9 }).where(eq(produit.id, id))); // l'ancien code a modifié le total seul
    await avecEntreprise(A, (tx) => resorberEcart(tx, A, id));
    const lignes = await avecEntreprise(A, (tx) => tx.select({ q: stockDepot.quantite, d: stockDepot.depotId }).from(stockDepot).where(eq(stockDepot.produitId, id)));
    expect(lignes.reduce((s, l) => s + l.q, 0)).toBe(9);
  });

  test("fuite entre entreprises : B ne voit pas les dépôts de A, ne transfère pas ses produits et ne touche pas à ses dépôts", async () => {
    const id = await nouveau(10);
    const depotsA = await avecEntreprise(A, (tx) => listerDepots(tx, A));
    const [d1, d2] = depotsA;

    const depotsVusParB = await avecEntreprise(B, (tx) => listerDepots(tx, B));
    expect(depotsVusParB.map((d) => d.id)).not.toContain(d1.id);
    expect(depotsVusParB).toHaveLength(1);

    expect((await avecEntreprise(B, (tx) => transfererStock(tx, B, id, d1.id, d2.id, 1, uB))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => corrigerStock(tx, B, id, { mode: "AJOUT", quantite: 1, motif: "RECEPTION", depotId: d1.id }, uB))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => renommerDepot(tx, B, d1.id, "Piraté"))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => definirDepotPrincipal(tx, B, d1.id))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => archiverDepot(tx, B, d2.id))).ok).toBe(false);
    await expect(avecEntreprise(B, (tx) => tx.insert(depot).values({ entrepriseId: A, nom: "Faux dépôt" }))).rejects.toThrow();
    expect(await avecEntreprise(B, (tx) => tx.select().from(stockDepot).where(eq(stockDepot.produitId, id)))).toEqual([]);
  });
});

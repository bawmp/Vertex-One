import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, numeroSerie, produit, utilisateur } from "@/db/schema";
import { exces, lireSeries, normaliserSerie, numerosAVendre } from "@/lib/produits/series-regles";
import { ajouterSeries, definirSuiviSerie, lireSeriesProduit, rechercherSeries, remettreSerieEnStock, retirerSerie } from "@/lib/produits/series";
import { definirSuiviLots } from "@/lib/produits/lots";
import { corrigerStock, decrementerStockVente, defaireMouvementsDocument } from "@/lib/produits/stock";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Priorité 3.4 (suite) : numéros de série — une unité, un numéro, de l'entrée à la vente. */
describe("Numéros de série — règles pures", () => {
  test("normalisation et lecture d'une liste collée", () => {
    expect(normaliserSerie("  sn  001 ")).toBe("SN 001");
    const r = lireSeries("SN1, sn2;SN3\nsn1\n\n  \r\nSN4");
    expect(r.numeros).toEqual(["SN1", "SN2", "SN3", "SN4"]);
    expect(r.doublons).toEqual(["SN1"]);
    expect(lireSeries("x".repeat(61)).invalides.length).toBe(1);
  });

  test("une vente prend les plus anciens numéros, puis l'ordre alphabétique", () => {
    const d = (n: number) => new Date(2026, 0, n);
    const lignes = [{ numero: "B", entreLe: d(2) }, { numero: "A", entreLe: d(2) }, { numero: "C", entreLe: d(1) }];
    expect(numerosAVendre(lignes, 2).map((l) => l.numero)).toEqual(["C", "A"]);
    expect(numerosAVendre(lignes, 10).length).toBe(3);
    expect(numerosAVendre(lignes, 0)).toEqual([]);
  });

  test("excédent de numéros en stock par rapport au stock réel", () => {
    expect(exces(5, 3)).toBe(2);
    expect(exces(2, 3)).toBe(0);
    expect(exces(2, -1)).toBe(2);
  });
});

describe("Numéros de série — base réelle", { timeout: 120_000 }, () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Serie A ${suffixe}`;
  const nomB = `TEST Serie B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let uB: string;
  const ids: Record<string, string> = {};

  const etat = (E: string, p: string) => avecEntreprise(E, (tx) => lireSeriesProduit(tx, E, p));
  const statuts = async (p: string) => Object.fromEntries((await avecEntreprise(A, (tx) => tx.select({ n: numeroSerie.numero, s: numeroSerie.statut }).from(numeroSerie).where(eq(numeroSerie.produitId, p)))).map((r) => [r.n, r.s]));
  const stock = async (p: string) => (await avecEntreprise(A, (tx) => tx.select({ s: produit.stockActuel }).from(produit).where(eq(produit.id, p))))[0].s;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [x] = await db.insert(utilisateur).values({ entrepriseId: A, email: `serie-a-${suffixe}@vertexone.test`, nomComplet: "Admin Serie A", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [y] = await db.insert(utilisateur).values({ entrepriseId: B, email: `serie-b-${suffixe}@vertexone.test`, nomComplet: "Admin Serie B", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = x.id;
    uB = y.id;
    await avecEntreprise(A, async (tx) => {
      const p = async (nom: string) => (await tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom, suiviStock: true, creeParId: uA }).returning({ id: produit.id }))[0].id;
      ids.tel = await p("Telephone");
      ids.autre = await p("Ecran");
    });
    await avecEntreprise(B, async (tx) => {
      ids.telB = (await tx.insert(produit).values({ entrepriseId: B, type: "BIEN", nom: "Telephone B", suiviStock: true, creeParId: uB }).returning({ id: produit.id }))[0].id;
    });
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 60_000);

  test("sans activation, ajouter des numéros est refusé ; activer puis ajouter une entrée augmente le stock", async () => {
    expect((await avecEntreprise(A, (tx) => ajouterSeries(tx, A, uA, ids.tel, "SN1", "ENTREE"))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => definirSuiviSerie(tx, A, ids.tel, true))).ok).toBe(true);
    const r1 = await avecEntreprise(A, (tx) => ajouterSeries(tx, A, uA, ids.tel, "sn-1\nsn-2", "ENTREE"));
    expect(r1.ok && r1.ajoutes).toBe(2);
    const r2 = await avecEntreprise(A, (tx) => ajouterSeries(tx, A, uA, ids.tel, "SN-3", "ENTREE"));
    expect(r2.ok).toBe(true);
    expect(await stock(ids.tel)).toBe(3);
    expect(await statuts(ids.tel)).toEqual({ "SN-1": "EN_STOCK", "SN-2": "EN_STOCK", "SN-3": "EN_STOCK" });
  });

  test("un numéro déjà connu est refusé (même en minuscules), « déjà en stock » est borné par les unités sans numéro", async () => {
    expect((await avecEntreprise(A, (tx) => ajouterSeries(tx, A, uA, ids.tel, "sn-2", "ENTREE"))).ok).toBe(false);
    expect(await stock(ids.tel)).toBe(3);
    expect((await avecEntreprise(A, (tx) => ajouterSeries(tx, A, uA, ids.tel, "SN-9", "STOCK"))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => ajouterSeries(tx, A, uA, ids.tel, "  ", "ENTREE"))).ok).toBe(false);
    // 2 unités arrivées sans numéro, puis numérotées
    await avecEntreprise(A, (tx) => corrigerStock(tx, A, ids.tel, { mode: "AJOUT", quantite: 2, motif: "RECEPTION" }, uA));
    expect((await etat(A, ids.tel))!.sansNumero).toBe(2);
    expect((await avecEntreprise(A, (tx) => ajouterSeries(tx, A, uA, ids.tel, "SN-4,SN-5,SN-6", "STOCK"))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => ajouterSeries(tx, A, uA, ids.tel, "SN-4,SN-5", "STOCK"))).ok).toBe(true);
    expect((await etat(A, ids.tel))!.sansNumero).toBe(0);
  });

  test("une vente emporte les plus anciens numéros et les rattache au document ; l'annulation les remet en stock", async () => {
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: ids.tel, quantite: 2 }], { documentType: "FACTURE", documentId: `fac-${suffixe}`, utilisateurId: uA }));
    const s = await statuts(ids.tel);
    expect(s["SN-1"]).toBe("VENDU");
    expect(s["SN-2"]).toBe("VENDU");
    expect(s["SN-3"]).toBe("EN_STOCK");
    const [vendu] = await avecEntreprise(A, (tx) => tx.select().from(numeroSerie).where(and(eq(numeroSerie.produitId, ids.tel), eq(numeroSerie.numero, "SN-1"))));
    expect(vendu.documentType).toBe("FACTURE");
    expect(vendu.documentId).toBe(`fac-${suffixe}`);
    expect(vendu.venduLe).not.toBeNull();
    expect(await stock(ids.tel)).toBe(3);

    await avecEntreprise(A, (tx) => defaireMouvementsDocument(tx, A, "FACTURE", `fac-${suffixe}`, uA));
    const apres = await statuts(ids.tel);
    expect(apres["SN-1"]).toBe("EN_STOCK");
    expect(apres["SN-2"]).toBe("EN_STOCK");
    expect(await stock(ids.tel)).toBe(5);
    const [remis] = await avecEntreprise(A, (tx) => tx.select().from(numeroSerie).where(and(eq(numeroSerie.produitId, ids.tel), eq(numeroSerie.numero, "SN-1"))));
    expect(remis.documentId).toBeNull();
  });

  test("vendre plus d'unités que de numéros : les numéros partent, le reste est vendu sans numéro", async () => {
    // 5 unités en stock et 5 numéros : on vend les 5, puis 1 de plus (vendue sans numéro)
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: ids.tel, quantite: 5 }], { documentType: "FACTURE", documentId: `fac2-${suffixe}` }));
    expect(Object.values(await statuts(ids.tel)).every((x) => x === "VENDU")).toBe(true);
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: ids.tel, quantite: 1 }], { documentType: "FACTURE", documentId: `fac3-${suffixe}` }));
    expect(await stock(ids.tel)).toBe(-1);
    await avecEntreprise(A, (tx) => defaireMouvementsDocument(tx, A, "FACTURE", `fac3-${suffixe}`, uA));
    expect(Object.values(await statuts(ids.tel)).every((x) => x === "VENDU")).toBe(true); // rien à restituer pour fac3
    await avecEntreprise(A, (tx) => defaireMouvementsDocument(tx, A, "FACTURE", `fac2-${suffixe}`, uA));
    expect(Object.values(await statuts(ids.tel)).every((x) => x === "EN_STOCK")).toBe(true);
  }, 120_000);

  test("retirer une unité : numéro retiré, stock −1 ; remettre : numéro en stock, stock +1", async () => {
    const [sn3] = await avecEntreprise(A, (tx) => tx.select({ id: numeroSerie.id }).from(numeroSerie).where(and(eq(numeroSerie.produitId, ids.tel), eq(numeroSerie.numero, "SN-3"))));
    expect((await avecEntreprise(A, (tx) => retirerSerie(tx, A, uA, sn3.id, "INVENTE"))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => retirerSerie(tx, A, uA, sn3.id, "CASSE"))).ok).toBe(true);
    expect((await statuts(ids.tel))["SN-3"]).toBe("RETIRE");
    expect(await stock(ids.tel)).toBe(4);
    expect((await avecEntreprise(A, (tx) => retirerSerie(tx, A, uA, sn3.id, "CASSE"))).ok).toBe(false); // déjà retiré
    expect((await avecEntreprise(A, (tx) => remettreSerieEnStock(tx, A, uA, sn3.id))).ok).toBe(true);
    expect((await statuts(ids.tel))["SN-3"]).toBe("EN_STOCK");
    expect(await stock(ids.tel)).toBe(5);
    expect((await avecEntreprise(A, (tx) => remettreSerieEnStock(tx, A, uA, sn3.id))).ok).toBe(false); // déjà en stock
  });

  test("une sortie manuelle qui fait passer le stock sous le nombre de numéros retire les plus récents", async () => {
    await avecEntreprise(A, (tx) => corrigerStock(tx, A, ids.tel, { mode: "RETRAIT", quantite: 2, motif: "PERTE" }, uA));
    const e = (await etat(A, ids.tel))!;
    expect(e.stock).toBe(3);
    expect(e.enStock).toBe(3);
    const s = await statuts(ids.tel);
    expect(Object.values(s).filter((x) => x === "RETIRE").length).toBe(2);
    expect(s["SN-1"]).toBe("EN_STOCK"); // les plus anciens restent
  });

  test("numéros de série et lots s'excluent", async () => {
    expect((await avecEntreprise(A, (tx) => definirSuiviLots(tx, A, ids.tel, true))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => definirSuiviLots(tx, A, ids.autre, true))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => definirSuiviSerie(tx, A, ids.autre, true))).ok).toBe(false);
    await avecEntreprise(A, (tx) => definirSuiviLots(tx, A, ids.autre, false));
  });

  test("recherche d'un numéro : partielle, insensible à la casse, jokers neutralisés", async () => {
    const r = await avecEntreprise(A, (tx) => rechercherSeries(tx, A, "sn-"));
    expect(r.length).toBeGreaterThanOrEqual(5);
    expect(r[0].produit).toBe("Telephone");
    expect((await avecEntreprise(A, (tx) => rechercherSeries(tx, A, "SN-4"))).length).toBe(1);
    expect((await avecEntreprise(A, (tx) => rechercherSeries(tx, A, "%%"))).length).toBe(0);
    expect((await avecEntreprise(A, (tx) => rechercherSeries(tx, A, "S"))).length).toBe(0);
  });

  test("FUITE ENTRE ENTREPRISES : une autre entreprise ne voit ni ne touche les numéros de série", async () => {
    expect((await avecEntreprise(B, (tx) => rechercherSeries(tx, B, "SN-"))).length).toBe(0);
    expect(await etat(B, ids.tel)).toBeNull();
    const [sn1] = await avecEntreprise(A, (tx) => tx.select({ id: numeroSerie.id }).from(numeroSerie).where(and(eq(numeroSerie.produitId, ids.tel), eq(numeroSerie.numero, "SN-1"))));
    expect((await avecEntreprise(B, (tx) => retirerSerie(tx, B, uB, sn1.id, "CASSE"))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => remettreSerieEnStock(tx, B, uB, sn1.id))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => ajouterSeries(tx, B, uB, ids.tel, "PIRATE-1", "ENTREE"))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => definirSuiviSerie(tx, B, ids.tel, false))).ok).toBe(false);
    // le produit de B suit ses propres numéros : « SN-1 » peut exister chez B sans heurter A
    await avecEntreprise(B, (tx) => definirSuiviSerie(tx, B, ids.telB, true));
    expect((await avecEntreprise(B, (tx) => ajouterSeries(tx, B, uB, ids.telB, "SN-1", "ENTREE"))).ok).toBe(true);
    expect((await statuts(ids.tel))["SN-1"]).toBe("EN_STOCK");
  });

  test("désactiver le suivi efface les numéros sans toucher le stock", async () => {
    const avant = await stock(ids.tel);
    expect((await avecEntreprise(A, (tx) => definirSuiviSerie(tx, A, ids.tel, false))).ok).toBe(true);
    expect(await statuts(ids.tel)).toEqual({});
    expect(await stock(ids.tel)).toBe(avant);
  });
});

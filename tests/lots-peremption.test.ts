import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, lotStock, mouvementStock, produit, stockDepot, utilisateur } from "@/db/schema";
import { exces, joursAvant, ordreFEFO, repartirFEFO, statutPeremption } from "@/lib/produits/lots-regles";
import { ajouterLot, definirSuiviLots, lireLots, lirePeremptions, modifierPeremption, retirerLot } from "@/lib/produits/lots";
import { assurerDepotPrincipal } from "@/lib/produits/depots";
import { corrigerStock, decrementerStockVente } from "@/lib/produits/stock";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";
import { aujourdhuiDouala } from "@/lib/facturation/promesse-regles";

const AUJ = "2026-06-15";
const lot = (id: string, datePeremption: string | null, quantite: number, jour = 1) => ({ id, datePeremption, quantite, creeLe: new Date(`2026-01-${String(jour).padStart(2, "0")}T10:00:00Z`) });

/** Priorité 3.4 : lots et dates de péremption — sorties « premier périmé, premier sorti ». */
describe("Lots — règles pures", () => {
  test("statut de péremption : périmé le lendemain de la date, bientôt à 30 jours", () => {
    expect(statutPeremption(null, AUJ)).toBe("SANS_DATE");
    expect(statutPeremption("2026-06-14", AUJ)).toBe("PERIME");
    expect(statutPeremption("2026-06-15", AUJ)).toBe("BIENTOT"); // encore vendable le jour même
    expect(statutPeremption("2026-07-15", AUJ)).toBe("BIENTOT");
    expect(statutPeremption("2026-07-16", AUJ)).toBe("OK");
    expect(joursAvant("2026-06-20", AUJ)).toBe(5);
  });

  test("ordre de sortie : le plus proche d'abord, sans date ensuite, périmés en dernier", () => {
    const ordre = ordreFEFO([lot("perime", "2026-05-01", 5), lot("loin", "2026-12-01", 5), lot("sans", null, 5), lot("proche", "2026-07-01", 5)], AUJ).map((l) => l.id);
    expect(ordre).toEqual(["proche", "loin", "sans", "perime"]);
  });

  test("répartition d'une sortie sur les lots, le reste est pris hors lots", () => {
    const lots = [lot("a", "2026-07-01", 4), lot("b", "2026-09-01", 10)];
    expect(repartirFEFO(lots, 6, AUJ)).toEqual({ retraits: [{ lotId: "a", quantite: 4 }, { lotId: "b", quantite: 2 }], reste: 0 });
    expect(repartirFEFO(lots, 20, AUJ)).toEqual({ retraits: [{ lotId: "a", quantite: 4 }, { lotId: "b", quantite: 10 }], reste: 6 });
    expect(repartirFEFO(lots, 0, AUJ)).toEqual({ retraits: [], reste: 0 });
  });

  test("excédent : retiré d'abord des périmés puis des lots qui se périment en dernier", () => {
    const lots = [lot("a", "2026-07-01", 4), lot("b", "2026-09-01", 10), lot("p", "2026-05-01", 3)];
    expect(exces(lots, 17, AUJ)).toEqual([]);
    expect(exces(lots, 15, AUJ)).toEqual([{ lotId: "p", quantite: 2 }]);
    expect(exces(lots, 5, AUJ)).toEqual([{ lotId: "p", quantite: 3 }, { lotId: "b", quantite: 9 }]);
  });
});

describe("Lots — base réelle", () => {
  // Les sorties de stock utilisent la vraie date du jour : toutes les dates du scénario sont relatives à aujourd'hui.
  const REEL = aujourdhuiDouala();
  const jour = (n: number) => new Date(Date.parse(`${REEL}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Lots A ${suffixe}`;
  const nomB = `TEST Lots B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let uB: string;
  let P = "";
  let principal = "";

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [x] = await db.insert(utilisateur).values({ entrepriseId: A, email: `lots-a-${suffixe}@vertexone.test`, nomComplet: "Admin Lots A", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [y] = await db.insert(utilisateur).values({ entrepriseId: B, email: `lots-b-${suffixe}@vertexone.test`, nomComplet: "Admin Lots B", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = x.id;
    uB = y.id;
    await avecEntreprise(A, async (tx) => {
      principal = (await assurerDepotPrincipal(tx, A)).id;
      const [r] = await tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom: "Yaourt", suiviStock: true, stockActuel: 30, coutMoyen: 200, creeParId: uA }).returning({ id: produit.id });
      P = r.id;
      await tx.insert(stockDepot).values({ entrepriseId: A, produitId: P, depotId: principal, quantite: 30 });
    });
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const etat = () => avecEntreprise(A, (tx) => lireLots(tx, A, P, REEL));
  const stock = async () => (await avecEntreprise(A, (tx) => tx.select({ s: produit.stockActuel }).from(produit).where(eq(produit.id, P))))[0].s;
  const ajouter = (l: Partial<Parameters<typeof ajouterLot>[3]>) => avecEntreprise(A, (tx) => ajouterLot(tx, A, uA, { produitId: P, numeroLot: "L1", datePeremption: null, quantite: 1, origine: "STOCK", ...l }));

  test("sans activer le suivi par lots, ajouter un lot est refusé ; activé, le stock existant se découpe en lots", async () => {
    expect((await ajouter({})).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => definirSuiviLots(tx, A, P, true))).ok).toBe(true);
    expect((await ajouter({ numeroLot: "L-JUIN", datePeremption: jour(15), quantite: 10 })).ok).toBe(true);
    expect((await ajouter({ numeroLot: "L-SEPT", datePeremption: jour(100), quantite: 12 })).ok).toBe(true);
    const e = await etat();
    expect(e!.lots.map((l) => l.numeroLot)).toEqual(["L-JUIN", "L-SEPT"]);
    expect(e!.sansLot).toBe(8);
    expect(e!.lots[0]).toMatchObject({ statut: "BIENTOT", jours: 15 });
    expect(await stock()).toBe(30); // découper le stock ne le change pas
  }, 120_000);

  test("refus : plus que le stock sans lot, date ou quantité invalide, numéro existant avec une autre date", async () => {
    expect((await ajouter({ numeroLot: "TROP", quantite: 9 })).ok).toBe(false); // 8 sans lot seulement
    expect((await ajouter({ numeroLot: "X", quantite: 0 })).ok).toBe(false);
    expect((await ajouter({ numeroLot: "X", quantite: 1, datePeremption: "2026-02-31" })).ok).toBe(false);
    expect((await ajouter({ numeroLot: "  ", quantite: 1 })).ok).toBe(false);
    expect((await ajouter({ numeroLot: "l-juin", quantite: 1, datePeremption: jour(400) })).ok).toBe(false);
    expect((await ajouter({ numeroLot: "l-juin", quantite: 2, datePeremption: jour(15) })).ok).toBe(true); // même lot, même date : la quantité s'ajoute
    expect((await etat())!.lots.find((l) => l.numeroLot === "L-JUIN")!.quantite).toBe(12);
  }, 120_000);

  test("nouvelle entrée : le stock augmente et une ligne « réception » est écrite", async () => {
    expect((await ajouter({ numeroLot: "L-NOV", datePeremption: jour(200), quantite: 5, origine: "ENTREE" })).ok).toBe(true);
    expect(await stock()).toBe(35);
    const histo = await avecEntreprise(A, (tx) => tx.select({ note: mouvementStock.note, quantite: mouvementStock.quantite, motif: mouvementStock.motif }).from(mouvementStock).where(and(eq(mouvementStock.produitId, P), eq(mouvementStock.motif, "RECEPTION"))));
    expect(histo).toEqual([{ note: "Lot L-NOV", quantite: 5, motif: "RECEPTION" }]);
  }, 120_000);

  test("une vente sort d'abord le lot qui se périme le plus tôt, puis le suivant, puis le stock sans lot", async () => {
    // Lots : JUIN 12, SEPT 12, NOV 5 ; sans lot 6 ; stock 35.
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: P, quantite: 15, prixUnitaire: 500 }]));
    let e = (await etat())!;
    expect(e.lots.map((l) => [l.numeroLot, l.quantite])).toEqual([["L-SEPT", 9], ["L-NOV", 5]]);
    expect(await stock()).toBe(20);
    expect(e.sansLot).toBe(6);

    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: P, quantite: 18, prixUnitaire: 500 }]));
    e = (await etat())!;
    expect(e.lots).toEqual([]);
    expect(e.sansLot).toBe(2); // 14 pris dans les lots, les 4 autres sur le stock sans lot (6 -> 2)
    expect(await stock()).toBe(2);
  }, 180_000);

  test("un retrait manuel ne laisse jamais plus de lots que de stock", async () => {
    expect((await ajouter({ numeroLot: "L-A", datePeremption: jour(60), quantite: 2, origine: "STOCK" })).ok).toBe(true); // stock 2, tout en lot
    const r = await avecEntreprise(A, (tx) => corrigerStock(tx, A, P, { mode: "RETRAIT", quantite: 1, motif: "PERTE" }, uA));
    expect(r.ok).toBe(true);
    const e = (await etat())!;
    expect(e.lots).toEqual([expect.objectContaining({ numeroLot: "L-A", quantite: 1 })]);
    expect(await stock()).toBe(1);
  }, 120_000);

  test("retirer un lot entier : le stock diminue, l'historique le dit, un motif invalide est refusé", async () => {
    expect((await ajouter({ numeroLot: "L-B", datePeremption: jour(-45), quantite: 4, origine: "ENTREE" })).ok).toBe(true);
    expect(await stock()).toBe(5);

    const surveillance = await avecEntreprise(A, (tx) => lirePeremptions(tx, A, 30, REEL));
    expect(surveillance).toEqual([expect.objectContaining({ numeroLot: "L-B", statut: "PERIME", jours: -45, quantite: 4, valeur: 800 })]);

    const lotB = (await etat())!.lots.find((l) => l.numeroLot === "L-B")!;
    expect((await avecEntreprise(A, (tx) => retirerLot(tx, A, uA, lotB.id, "N_IMPORTE_QUOI"))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => retirerLot(tx, A, uA, lotB.id, "PERIME"))).ok).toBe(true);
    expect(await stock()).toBe(1);
    expect((await etat())!.lots.map((l) => l.numeroLot)).toEqual(["L-A"]);
    const histo = await avecEntreprise(A, (tx) => tx.select({ quantite: mouvementStock.quantite, note: mouvementStock.note }).from(mouvementStock).where(and(eq(mouvementStock.produitId, P), eq(mouvementStock.motif, "PERIME"))));
    expect(histo).toEqual([{ quantite: -4, note: "Lot L-B" }]);
    expect((await avecEntreprise(A, (tx) => retirerLot(tx, A, uA, lotB.id, "PERIME"))).ok).toBe(false); // déjà retiré
  }, 180_000);

  test("modifier une date : validée, et le lot apparaît dans la surveillance", async () => {
    const lotA = (await etat())!.lots[0];
    expect((await avecEntreprise(A, (tx) => modifierPeremption(tx, A, lotA.id, "2026-13-40"))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => modifierPeremption(tx, A, lotA.id, jour(5)))).ok).toBe(true);
    const s = await avecEntreprise(A, (tx) => lirePeremptions(tx, A, 30, REEL));
    expect(s).toEqual([expect.objectContaining({ numeroLot: "L-A", statut: "BIENTOT", jours: 5 })]);
  }, 120_000);

  test("couper le suivi par lots efface les lots sans toucher au stock", async () => {
    expect((await avecEntreprise(A, (tx) => definirSuiviLots(tx, A, P, false))).ok).toBe(true);
    expect(await avecEntreprise(A, (tx) => tx.select().from(lotStock).where(eq(lotStock.produitId, P)))).toEqual([]);
    expect(await stock()).toBe(1);
    expect((await avecEntreprise(A, (tx) => definirSuiviLots(tx, A, P, true))).ok).toBe(true);
    expect((await ajouter({ numeroLot: "L-R", datePeremption: jour(300), quantite: 1 })).ok).toBe(true);
  }, 120_000);

  test("fuite entre entreprises : B ne voit ni ne touche aux lots de A", async () => {
    const lotR = (await etat())!.lots[0];
    expect(await avecEntreprise(B, (tx) => lireLots(tx, B, P, REEL))).toBeNull();
    expect(await avecEntreprise(B, (tx) => lirePeremptions(tx, B, 3650, REEL))).toEqual([]);
    expect((await avecEntreprise(B, (tx) => ajouterLot(tx, B, uB, { produitId: P, numeroLot: "PIRATE", datePeremption: null, quantite: 1, origine: "ENTREE" }))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => retirerLot(tx, B, uB, lotR.id, "PERIME"))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => modifierPeremption(tx, B, lotR.id, jour(2000)))).ok).toBe(false);
    expect((await etat())!.lots[0]).toMatchObject({ numeroLot: "L-R", quantite: 1, datePeremption: jour(300) });
    expect(await stock()).toBe(1);
  }, 120_000);
});

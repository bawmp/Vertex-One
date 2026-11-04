import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, numeroSerie, produit, utilisateur } from "@/db/schema";
import { remplacementPossible, repartirSeries } from "@/lib/produits/series-regles";
import { ajouterSeries, definirSuiviSerie, remplacerSerieVendue, seriesDeDocument } from "@/lib/produits/series";
import { restituerSeriesRetour, seriesVenduesDuDocument } from "@/lib/produits/series-sortie";
import { decrementerStockVente } from "@/lib/produits/stock";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Numéros de série sur la facture : impression, échange d'un numéro vendu, retour par avoir. */
describe("Numéros de série sur la facture — règles pures", () => {
  test("répartition sur les lignes : dans l'ordre, le reliquat sur la dernière ligne du produit", () => {
    const l = [
      { produitId: "p1", quantite: 2 },
      { produitId: null, quantite: 1 },
      { produitId: "p1", quantite: 1 },
      { produitId: "p2", quantite: 1 },
    ];
    const r = repartirSeries(l, new Map([["p1", ["A", "B", "C"]]]));
    expect(r.map((x) => x.series)).toEqual([["A", "B"], [], ["C"], []]);
    const surplus = repartirSeries([{ produitId: "p1", quantite: 1 }], new Map([["p1", ["A", "B"]]]));
    expect(surplus[0].series).toEqual(["A", "B"]);
    expect(repartirSeries([{ produitId: "p1", quantite: 1.5 }, { produitId: "p1", quantite: 1 }], new Map([["p1", ["A", "B", "C"]]])).map((x) => x.series)).toEqual([["A", "B"], ["C"]]);
  });

  test("échange possible seulement vendu → en stock, même produit, numéro différent", () => {
    expect(remplacementPossible({ produitId: "p", statut: "VENDU" }, { produitId: "p", statut: "EN_STOCK", id: "n" }, "v")).toBe(true);
    expect(remplacementPossible({ produitId: "p", statut: "EN_STOCK" }, { produitId: "p", statut: "EN_STOCK", id: "n" }, "v")).toBe(false);
    expect(remplacementPossible({ produitId: "p", statut: "VENDU" }, { produitId: "q", statut: "EN_STOCK", id: "n" }, "v")).toBe(false);
    expect(remplacementPossible({ produitId: "p", statut: "VENDU" }, { produitId: "p", statut: "VENDU", id: "n" }, "v")).toBe(false);
    expect(remplacementPossible({ produitId: "p", statut: "VENDU" }, { produitId: "p", statut: "EN_STOCK", id: "v" }, "v")).toBe(false);
  });
});

describe("Numéros de série sur la facture — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST SerieFac A ${suffixe}`;
  const nomB = `TEST SerieFac B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let uB: string;
  let tel = "";
  const fac = `fac-${suffixe}`;
  const etat = async (numero: string) => (await avecEntreprise(A, (tx) => tx.select().from(numeroSerie).where(and(eq(numeroSerie.entrepriseId, A), eq(numeroSerie.numero, numero)))))[0];

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce" }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [x] = await db.insert(utilisateur).values({ entrepriseId: A, email: `sf-a-${suffixe}@vertexone.test`, nomComplet: "Admin SF A", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [y] = await db.insert(utilisateur).values({ entrepriseId: B, email: `sf-b-${suffixe}@vertexone.test`, nomComplet: "Admin SF B", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = x.id;
    uB = y.id;
    await avecEntreprise(A, async (tx) => {
      tel = (await tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom: "Telephone", suiviStock: true, creeParId: uA }).returning({ id: produit.id }))[0].id;
      await definirSuiviSerie(tx, A, tel, true);
      await ajouterSeries(tx, A, uA, tel, "SN1\nSN2\nSN3\nSN4", "ENTREE");
    });
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 60_000);

  test("une vente de 2 unités : les numéros partent, se lisent par document et par produit", async () => {
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: tel, quantite: 2 }], { documentType: "FACTURE", documentId: fac, utilisateurId: uA }));
    const lus = await avecEntreprise(A, (tx) => seriesVenduesDuDocument(tx, A, "FACTURE", fac));
    expect(lus.get(tel)).toEqual(["SN1", "SN2"]);
    const detail = await avecEntreprise(A, (tx) => seriesDeDocument(tx, A, "FACTURE", fac));
    expect(detail.map((d) => d.numero)).toEqual(["SN1", "SN2"]);
    expect(detail[0].disponibles.map((d) => d.numero)).toEqual(["SN3", "SN4"]);
  }, 90_000);

  test("échanger un numéro vendu : l'ancien revient en stock, le nouveau est vendu, le stock ne bouge pas", async () => {
    const stockAvant = (await avecEntreprise(A, (tx) => tx.select({ s: produit.stockActuel }).from(produit).where(eq(produit.id, tel))))[0].s;
    const vendu = await etat("SN2");
    const nouveau = await etat("SN4");
    expect((await avecEntreprise(A, (tx) => remplacerSerieVendue(tx, A, vendu.id, nouveau.id))).ok).toBe(true);
    expect((await etat("SN2")).statut).toBe("EN_STOCK");
    expect(await etat("SN4")).toMatchObject({ statut: "VENDU", documentType: "FACTURE", documentId: fac });
    expect((await avecEntreprise(A, (tx) => tx.select({ s: produit.stockActuel }).from(produit).where(eq(produit.id, tel))))[0].s).toBe(stockAvant);
    // Un numéro déjà en stock ne peut pas être « vendu » par échange, ni un numéro vendu en remplaçant un autre vendu.
    const [sn1, sn2, sn3] = [await etat("SN1"), await etat("SN2"), await etat("SN3")];
    expect((await avecEntreprise(A, (tx) => remplacerSerieVendue(tx, A, sn3.id, sn2.id))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => remplacerSerieVendue(tx, A, sn1.id, nouveau.id))).ok).toBe(false);
  }, 90_000);

  test("retour par avoir : le dernier numéro vendu revient en stock, sans toucher à l'autre facture", async () => {
    const n = await avecEntreprise(A, (tx) => restituerSeriesRetour(tx, A, tel, "FACTURE", fac, 1));
    expect(n).toBe(1);
    expect((await etat("SN4")).statut).toBe("EN_STOCK"); // SN1 et SN4 vendus : le plus grand numéro revient
    expect((await etat("SN1")).statut).toBe("VENDU");
    expect(await avecEntreprise(A, (tx) => restituerSeriesRetour(tx, A, tel, "FACTURE", "autre-facture", 3))).toBe(0);
    expect(await avecEntreprise(A, (tx) => restituerSeriesRetour(tx, A, tel, "FACTURE", fac, 0))).toBe(0);
  }, 90_000);

  test("FUITE : une autre entreprise ne lit ni n'échange les numéros d'une facture de la première", async () => {
    expect((await avecEntreprise(B, (tx) => seriesDeDocument(tx, B, "FACTURE", fac))).length).toBe(0);
    expect((await avecEntreprise(B, (tx) => seriesVenduesDuDocument(tx, B, "FACTURE", fac))).size).toBe(0);
    const vendu = await etat("SN1");
    const libre = await etat("SN2");
    expect((await avecEntreprise(B, (tx) => remplacerSerieVendue(tx, B, vendu.id, libre.id))).ok).toBe(false);
    expect(await avecEntreprise(B, (tx) => restituerSeriesRetour(tx, B, tel, "FACTURE", fac, 1))).toBe(0);
    expect((await etat("SN1")).statut).toBe("VENDU");
    void uB;
  }, 60_000);
});

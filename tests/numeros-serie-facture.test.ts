import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, numeroSerie, produit, utilisateur } from "@/db/schema";
import { dureeGarantieValide, etatGarantie, finGarantie, joursAvantFinGarantie, remplacementPossible, repartirSeries } from "@/lib/produits/series-regles";
import { ajouterSeries, definirDureeGarantie, definirSuiviSerie, garantiesASurveiller, remplacerSerieVendue, seriesDeDocument } from "@/lib/produits/series";
import { restituerSeriesRetour, seriesVenduesDuDocument } from "@/lib/produits/series-sortie";
import { decrementerStockVente, defaireMouvementsDocument } from "@/lib/produits/stock";
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

describe("Garantie des numéros de série — règles pures", () => {
  test("fin de garantie : mois entiers, fin de mois et année bissextile", () => {
    expect(finGarantie("2026-03-10", 12)).toBe("2027-03-10");
    expect(finGarantie("2026-01-31", 1)).toBe("2026-02-28");
    expect(finGarantie("2027-01-31", 1)).toBe("2027-02-28");
    expect(finGarantie("2023-12-31", 2)).toBe("2024-02-29"); // 2024 est bissextile
    expect(finGarantie("2026-11-04", 24)).toBe("2028-11-04");
    expect(finGarantie("2026-02-31", 12)).toBeNull();
    expect(finGarantie("2026-03-10", 0)).toBeNull();
    expect(finGarantie("2026-03-10", 121)).toBeNull();
    expect(dureeGarantieValide(12)).toBe(true);
    expect(dureeGarantieValide(1.5)).toBe(false);
  });

  test("état d'une garantie : active, bientôt, expirée", () => {
    expect(etatGarantie("2027-03-10", "2026-11-04")).toBe("ACTIVE");
    expect(etatGarantie("2026-11-20", "2026-11-04")).toBe("BIENTOT");
    expect(etatGarantie("2026-11-04", "2026-11-04")).toBe("BIENTOT"); // se termine aujourd'hui : encore valable
    expect(etatGarantie("2026-11-03", "2026-11-04")).toBe("EXPIREE");
    expect(etatGarantie(null, "2026-11-04")).toBeNull();
    expect(joursAvantFinGarantie("2026-11-14", "2026-11-04")).toBe(10);
    expect(joursAvantFinGarantie("2026-11-01", "2026-11-04")).toBe(-3);
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

  test("garantie : calculée à la vente d'après la durée du produit, suit l'échange, disparaît au retour ; durée invalide ou autre entreprise refusées", async () => {
    // Durée invalide / produit d'une autre entreprise refusés.
    expect((await avecEntreprise(A, (tx) => definirDureeGarantie(tx, A, tel, 0))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => definirDureeGarantie(tx, A, tel, 200))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => definirDureeGarantie(tx, B, tel, 12))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => definirDureeGarantie(tx, A, tel, 12))).ok).toBe(true);

    // Une nouvelle vente de 1 unité (SN2 est en stock) : sa garantie court 12 mois à partir d'aujourd'hui.
    const facG = `facg-${suffixe}`;
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: tel, quantite: 1 }], { documentType: "FACTURE", documentId: facG, utilisateurId: uA }));
    const jour = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(new Date());
    const vendues = await avecEntreprise(A, (tx) => tx.select().from(numeroSerie).where(and(eq(numeroSerie.entrepriseId, A), eq(numeroSerie.documentId, facG))));
    expect(vendues).toHaveLength(1);
    expect(vendues[0].garantieFin).toBe(finGarantie(jour, 12));
    // Les unités vendues AVANT le réglage n'ont pas de garantie.
    expect((await etat("SN1")).garantieFin).toBeNull();

    // L'échange déplace la garantie vers le nouveau numéro.
    const libre = (await avecEntreprise(A, (tx) => tx.select().from(numeroSerie).where(and(eq(numeroSerie.entrepriseId, A), eq(numeroSerie.statut, "EN_STOCK")))))[0];
    expect((await avecEntreprise(A, (tx) => remplacerSerieVendue(tx, A, vendues[0].id, libre.id))).ok).toBe(true);
    expect((await etat(vendues[0].numero)).garantieFin).toBeNull();
    expect((await etat(libre.numero)).garantieFin).toBe(finGarantie(jour, 12));

    // À surveiller : une garantie qui se termine dans 10 jours apparaît, une qui se termine dans un an non.
    await avecEntreprise(A, (tx) => tx.update(numeroSerie).set({ garantieFin: "2026-11-14" }).where(eq(numeroSerie.id, libre.id)));
    const proches = await avecEntreprise(A, (tx) => garantiesASurveiller(tx, A, "2026-11-04", 30));
    expect(proches.map((g) => g.numero)).toEqual([libre.numero]);
    expect((await avecEntreprise(B, (tx) => garantiesASurveiller(tx, B, "2026-11-04", 30)))).toEqual([]);

    // L'annulation de la vente remet l'unité en stock, sans garantie.
    await avecEntreprise(A, (tx) => defaireMouvementsDocument(tx, A, "FACTURE", facG, uA));
    expect((await etat(libre.numero)).garantieFin).toBeNull();
  }, 180_000);

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

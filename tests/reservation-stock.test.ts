import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { bonCommandeVente, contact, depot, entreprise, ligneBonCommandeVente, produit, stockDepot, utilisateur } from "@/db/schema";
import { commandesQuiReservent, reservesParProduit, stockDisponible } from "@/lib/produits/reservations";
import { MESSAGE_STOCK_INSUFFISANT, MESSAGE_STOCK_RESERVE, verifierStockSuffisant } from "@/lib/produits/stock";
import { lireAReapprovisionner } from "@/lib/produits/reapprovisionnement";
import { assurerDepotPrincipal } from "@/lib/produits/depots";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Priorité 3.7 : une commande client en cours réserve du stock ; la réservation se libère quand elle est facturée ou annulée. */
describe("Réservation — règle pure", () => {
  test("disponible = stock − réservé, négatif possible, une réservation négative est ignorée", () => {
    expect(stockDisponible(10, 4)).toBe(6);
    expect(stockDisponible(3, 5)).toBe(-2);
    expect(stockDisponible(10, 0)).toBe(10);
    expect(stockDisponible(10, -3)).toBe(10);
  });
});

describe("Réservation — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Reserv A ${suffixe}`;
  const nomB = `TEST Reserv B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let principal = "";
  let secondaire = "";
  let client = "";
  let P = "";
  const commandes: Record<string, string> = {};

  const commander = async (cle: string, quantite: number, statut: "BROUILLON" | "FACTURE" | "ANNULE" = "BROUILLON", depotId: string | null = null, produitId = P) => {
    await avecEntreprise(A, async (tx) => {
      const [bc] = await tx
        .insert(bonCommandeVente)
        .values({ entrepriseId: A, numero: `BCV-T-${suffixe}-${cle}`, contactId: client, assigneAId: uA, creeParId: uA, statut, depotId, montantHT: 0, montantTTC: 0 })
        .returning({ id: bonCommandeVente.id });
      commandes[cle] = bc.id;
      await tx.insert(ligneBonCommandeVente).values({ entrepriseId: A, bonCommandeVenteId: bc.id, produitId, designation: "Ligne", quantite, prixUnitaire: 1000 });
    });
  };

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce", gereStock: true, bloquerVenteRupture: true }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce", gereStock: true, bloquerVenteRupture: true }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [x] = await db.insert(utilisateur).values({ entrepriseId: A, email: `resv-a-${suffixe}@vertexone.test`, nomComplet: "Admin Resv A", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = x.id;
    await avecEntreprise(A, async (tx) => {
      principal = (await assurerDepotPrincipal(tx, A)).id;
      [{ id: secondaire }] = await tx.insert(depot).values({ entrepriseId: A, nom: "Entrepôt" }).returning({ id: depot.id });
      [{ id: client }] = await tx.insert(contact).values({ entrepriseId: A, nom: "Client Resv", telephone: "+237600000099", assigneAId: uA }).returning({ id: contact.id });
      const [r] = await tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom: "Riz 25kg", suiviStock: true, stockActuel: 10, seuilAlerte: 2, prixAchat: 9000, creeParId: uA }).returning({ id: produit.id });
      P = r.id;
      await tx.insert(stockDepot).values({ entrepriseId: A, produitId: P, depotId: principal, quantite: 10 });
    });
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const verifier = (quantite: number, options: Parameters<typeof verifierStockSuffisant>[4] = {}, depotId: string | null = null) =>
    avecEntreprise(A, (tx) => verifierStockSuffisant(tx, A, [{ produitId: P, quantite }], depotId, options));

  test("sans commande en cours : aucune réservation, la vente est limitée au stock", async () => {
    expect((await avecEntreprise(A, (tx) => reservesParProduit(tx, A))).size).toBe(0);
    expect(await verifier(10)).toBeNull();
    expect(await verifier(11)).toMatchObject({ cle: MESSAGE_STOCK_INSUFFISANT });
  }, 120_000);

  test("une commande en cours réserve : seules les commandes en brouillon comptent (facturée ou annulée libère)", async () => {
    await commander("c1", 4);
    await commander("c2", 3, "FACTURE");
    await commander("c3", 5, "ANNULE");
    const reserves = await avecEntreprise(A, (tx) => reservesParProduit(tx, A));
    expect(reserves.get(P)).toBe(4);
    const liste = await avecEntreprise(A, (tx) => commandesQuiReservent(tx, A, P));
    expect(liste).toEqual([expect.objectContaining({ id: commandes.c1, quantite: 4 })]);
  }, 120_000);

  test("une autre vente ne peut pas prendre le stock réservé ; la commande elle-même peut être facturée", async () => {
    expect(await verifier(6)).toBeNull(); // 10 − 4 = 6 disponibles
    const refus = await verifier(7);
    expect(refus).toEqual({ cle: MESSAGE_STOCK_RESERVE, valeurs: expect.objectContaining({ disponible: 6, reserve: 4, demande: 7 }) });
    // Facturer la commande c1 (4) : elle ne se réserve pas à elle-même.
    expect(await verifier(4, { exclureCommandeId: commandes.c1 })).toBeNull();
    expect(await verifier(10, { exclureCommandeId: commandes.c1 })).toBeNull();
    expect(await verifier(11, { exclureCommandeId: commandes.c1 })).toMatchObject({ cle: MESSAGE_STOCK_INSUFFISANT });
  }, 120_000);

  test("plusieurs commandes se cumulent ; une commande d'un autre dépôt ne réserve pas le dépôt principal", async () => {
    await commander("c4", 2); // principal (sans dépôt)
    await commander("c5", 9, "BROUILLON", secondaire);
    const reservePrincipal = await avecEntreprise(A, (tx) => reservesParProduit(tx, A, { depotId: principal }));
    const reserveSecond = await avecEntreprise(A, (tx) => reservesParProduit(tx, A, { depotId: secondaire }));
    expect(reservePrincipal.get(P)).toBe(6); // c1 (4) + c4 (2)
    expect(reserveSecond.get(P)).toBe(9);
    expect((await avecEntreprise(A, (tx) => reservesParProduit(tx, A))).get(P)).toBe(15); // tous dépôts confondus
    expect(await verifier(4)).toBeNull(); // 10 − 6
    expect(await verifier(5)).toMatchObject({ cle: MESSAGE_STOCK_RESERVE });
  }, 180_000);

  test("annuler une commande libère sa réservation", async () => {
    await avecEntreprise(A, (tx) => tx.update(bonCommandeVente).set({ statut: "ANNULE" }).where(eq(bonCommandeVente.id, commandes.c1)));
    await avecEntreprise(A, (tx) => tx.update(bonCommandeVente).set({ statut: "FACTURE" }).where(eq(bonCommandeVente.id, commandes.c5)));
    expect((await avecEntreprise(A, (tx) => reservesParProduit(tx, A))).get(P)).toBe(2);
    expect(await verifier(8)).toBeNull();
  }, 120_000);

  test("sans le réglage « interdire la vente en rupture », rien n'est refusé même si tout est réservé", async () => {
    await avecEntreprise(A, (tx) => tx.update(entreprise).set({ bloquerVenteRupture: false }).where(eq(entreprise.id, A)));
    expect(await verifier(500)).toBeNull();
    await avecEntreprise(A, (tx) => tx.update(entreprise).set({ bloquerVenteRupture: true }).where(eq(entreprise.id, A)));
  }, 120_000);

  test("« À réapprovisionner » juge le stock disponible : un produit promis aux clients est à recommander", async () => {
    // Stock 10, seuil 2, réservé 2 : disponible 8, pas à recommander.
    expect((await avecEntreprise(A, (tx) => lireAReapprovisionner(tx, A))).lignes).toEqual([]);
    await commander("c6", 7);
    const { lignes } = await avecEntreprise(A, (tx) => lireAReapprovisionner(tx, A));
    // Réservé 9 : disponible 1, sous le seuil de 2.
    expect(lignes).toEqual([expect.objectContaining({ produitId: P, stockActuel: 10, reserve: 9, niveau: "BAS", quantiteSuggeree: 3 })]);
  }, 180_000);

  test("fuite entre entreprises : B ne voit pas les réservations de A", async () => {
    expect((await avecEntreprise(B, (tx) => reservesParProduit(tx, B))).size).toBe(0);
    expect(await avecEntreprise(B, (tx) => commandesQuiReservent(tx, B, P))).toEqual([]);
    expect((await avecEntreprise(B, (tx) => lireAReapprovisionner(tx, B))).lignes).toEqual([]);
  }, 120_000);
});

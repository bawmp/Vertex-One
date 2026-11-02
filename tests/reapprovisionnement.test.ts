import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { bonCommandeAchat, entreprise, fournisseur, ligneBonCommandeAchat, produit, utilisateur } from "@/db/schema";
import { quantiteSuggeree, stockVise } from "@/lib/produits/reapprovisionnement-regles";
import { creerBonsDeCommande, definirReapprovisionnement, lireAReapprovisionner } from "@/lib/produits/reapprovisionnement";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Priorité 3.1 : liste de ce qu'il faut commander et bons de commande fournisseur créés d'un clic. */
describe("Réapprovisionnement — règles pures", () => {
  test("stock visé : le cible, sinon le double du seuil, jamais moins que seuil + 1 ni 1", () => {
    expect(stockVise({ seuilAlerte: 5, stockCible: 30 })).toBe(30);
    expect(stockVise({ seuilAlerte: 5, stockCible: null })).toBe(10);
    expect(stockVise({ seuilAlerte: 5, stockCible: 3 })).toBe(6);
    expect(stockVise({ seuilAlerte: 0, stockCible: null })).toBe(1);
    expect(stockVise({ seuilAlerte: null, stockCible: null })).toBe(1);
  });

  test("quantité proposée : ce qu'il manque, moins ce qui est déjà commandé, jamais négative", () => {
    expect(quantiteSuggeree({ stockActuel: 2, seuilAlerte: 5, stockCible: null, enCommande: 0 })).toBe(8);
    expect(quantiteSuggeree({ stockActuel: 2, seuilAlerte: 5, stockCible: null, enCommande: 5 })).toBe(3);
    expect(quantiteSuggeree({ stockActuel: 2, seuilAlerte: 5, stockCible: null, enCommande: 50 })).toBe(0);
    expect(quantiteSuggeree({ stockActuel: -3, seuilAlerte: 5, stockCible: 20, enCommande: 0 })).toBe(23); // les ventes en rupture se rattrapent
    expect(quantiteSuggeree({ stockActuel: 0, seuilAlerte: null, stockCible: null, enCommande: 0 })).toBe(1);
  });
});

describe("Réapprovisionnement — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Reappro A ${suffixe}`;
  const nomB = `TEST Reappro B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let fA: string;
  let fB: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce" }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: A, email: `reappro-a-${suffixe}@vertexone.test`, nomComplet: "Admin Reappro A", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = ua.id;
    await avecEntreprise(A, async (tx) => {
      [{ id: fA }] = await tx.insert(fournisseur).values({ entrepriseId: A, nom: "Grossiste A", telephone: "690000001" }).returning({ id: fournisseur.id });
      const p = (nom: string, valeurs: Partial<typeof produit.$inferInsert>) => tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom, suiviStock: true, creeParId: uA, prixAchat: 1000, ...valeurs }).returning({ id: produit.id });
      ids.bas = (await p("Article bas", { stockActuel: 2, seuilAlerte: 5 }))[0].id;
      ids.rupture = (await p("Article rupture", { stockActuel: 0, seuilAlerte: 4, stockCible: 20, prixAchat: 2500 }))[0].id;
      ids.ok = (await p("Article correct", { stockActuel: 50, seuilAlerte: 5 }))[0].id;
      ids.service = (await tx.insert(produit).values({ entrepriseId: A, type: "SERVICE", nom: "Prestation", creeParId: uA }).returning({ id: produit.id }))[0].id;
    });
    await avecEntreprise(B, async (tx) => {
      [{ id: fB }] = await tx.insert(fournisseur).values({ entrepriseId: B, nom: "Grossiste B", telephone: "690000002" }).returning({ id: fournisseur.id });
    });
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  test("la liste contient les produits bas ou en rupture, avec la quantité proposée ; ni produit correct ni service", async () => {
    const { lignes, fournisseurs } = await avecEntreprise(A, (tx) => lireAReapprovisionner(tx, A));
    expect(lignes.map((l) => l.nom).sort()).toEqual(["Article bas", "Article rupture"]);
    expect(lignes.find((l) => l.nom === "Article bas")).toMatchObject({ niveau: "BAS", quantiteSuggeree: 8, enCommande: 0 });
    expect(lignes.find((l) => l.nom === "Article rupture")).toMatchObject({ niveau: "RUPTURE", quantiteSuggeree: 20, prixAchat: 2500 });
    expect(fournisseurs.map((f) => f.nom)).toEqual(["Grossiste A"]);
  }, 90_000);

  test("créer les bons : un brouillon par fournisseur, prix d'achat, TVA, fournisseur habituel retenu, puis la liste tient compte de la commande", async () => {
    const r = await avecEntreprise(A, (tx) => creerBonsDeCommande(tx, A, uA, [{ produitId: ids.bas, quantite: 8, fournisseurId: fA }, { produitId: ids.rupture, quantite: 20, fournisseurId: fA }]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bons).toHaveLength(1);
    expect(r.bons[0].lignes).toBe(2);

    const [bon] = await avecEntreprise(A, (tx) => tx.select().from(bonCommandeAchat).where(eq(bonCommandeAchat.numero, r.bons[0].numero)));
    expect(bon.statut).toBe("BROUILLON");
    expect(bon.montantHT).toBe(8 * 1000 + 20 * 2500);
    expect(bon.montantTVA).toBe(Math.round(58000 * 0.1925));
    const lignes = await avecEntreprise(A, (tx) => tx.select().from(ligneBonCommandeAchat).where(eq(ligneBonCommandeAchat.bonCommandeAchatId, bon.id)));
    expect(lignes).toHaveLength(2);

    const [bas] = await avecEntreprise(A, (tx) => tx.select({ f: produit.fournisseurHabituelId, stock: produit.stockActuel }).from(produit).where(eq(produit.id, ids.bas)));
    expect(bas.f).toBe(fA);
    expect(bas.stock).toBe(2); // un bon de commande ne touche jamais au stock

    const apres = await avecEntreprise(A, (tx) => lireAReapprovisionner(tx, A));
    const ligneBas = apres.lignes.find((l) => l.nom === "Article bas")!;
    expect(ligneBas).toMatchObject({ enCommande: 8, quantiteSuggeree: 0, fournisseurId: fA });
  }, 120_000);

  test("refus : liste vide, quantité invalide, doublon, produit ou fournisseur d'une autre entreprise, service", async () => {
    const essai = (d: Parameters<typeof creerBonsDeCommande>[3]) => avecEntreprise(A, (tx) => creerBonsDeCommande(tx, A, uA, d));
    expect((await essai([])).ok).toBe(false);
    expect((await essai([{ produitId: ids.bas, quantite: 0, fournisseurId: fA }])).ok).toBe(false);
    expect((await essai([{ produitId: ids.bas, quantite: 1.5, fournisseurId: fA }])).ok).toBe(false);
    expect((await essai([{ produitId: ids.bas, quantite: 1, fournisseurId: fA }, { produitId: ids.bas, quantite: 2, fournisseurId: fA }])).ok).toBe(false);
    expect((await essai([{ produitId: ids.bas, quantite: 1, fournisseurId: fB }])).ok).toBe(false); // fournisseur de B
    expect((await essai([{ produitId: ids.service, quantite: 1, fournisseurId: fA }])).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => definirReapprovisionnement(tx, A, ids.bas, fB, null))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => definirReapprovisionnement(tx, A, ids.bas, fA, -1))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => definirReapprovisionnement(tx, A, ids.bas, fA, 40))).ok).toBe(true);
  }, 120_000);

  test("fuite entre entreprises : B ne voit aucun produit de A et ne peut pas commander les siens", async () => {
    const vueB = await avecEntreprise(B, (tx) => lireAReapprovisionner(tx, B));
    expect(vueB.lignes).toEqual([]);
    expect(vueB.fournisseurs.map((f) => f.nom)).toEqual(["Grossiste B"]);
    const r = await avecEntreprise(B, (tx) => creerBonsDeCommande(tx, B, uA, [{ produitId: ids.rupture, quantite: 5, fournisseurId: fB }]));
    expect(r.ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => definirReapprovisionnement(tx, B, ids.bas, null, 10))).ok).toBe(false);
  }, 120_000);
});

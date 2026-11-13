import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, produit, connexionBoutique, stockPousse, mouvementStock } from "@/db/schema";
import { chiffrerConfig } from "@/lib/boutique/chiffrement";
import { creerAdaptateurWooCommerce } from "@/lib/boutique/woocommerce";
import { apercuConnexion, synchroniserConnexion, type FabriqueAdaptateur } from "@/lib/boutique/synchro";
import { date, fauxWooCommerce } from "./aide-woocommerce";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/* ------------------------------------------------------------ jeu d'essai ------------------------------------------------------------ */
const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST BoutiqueSynchro A ${suffixe}`;
const nomB = `TEST BoutiqueSynchro B ${suffixe}`;
const W1 = `W1-${suffixe}`;
const W2 = `W2-${suffixe}`;
const SITE_SEUL = `SITE-${suffixe}`;
let idA = "", idB = "", adminA = "", adminB = "", p1 = "", p2 = "", pB = "", connexionA = "";
const woo = fauxWooCommerce();

const fabrique: FabriqueAdaptateur = (type, config) =>
  type === "WOOCOMMERCE" ? creerAdaptateurWooCommerce({ base: config.base ?? "https://boutique.test", cle: config.cle, secret: config.secret }, woo.appeler) : null;

const stockDe = (entrepriseId: string, id: string) => avecEntreprise(entrepriseId, async (tx) => (await tx.select({ s: produit.stockActuel }).from(produit).where(eq(produit.id, id)))[0].s);
const stockWoo = (sku: string) => woo.etat.produits.find((p) => p.sku === sku)?.stock;
const lireConnexion = (entrepriseId: string, id: string) => avecEntreprise(entrepriseId, async (tx) => (await tx.select().from(connexionBoutique).where(eq(connexionBoutique.id, id)))[0]);
const nouveauProduit = (entrepriseId: string, creeParId: string, v: Partial<typeof produit.$inferInsert>) =>
  avecEntreprise(entrepriseId, async (tx) => (await tx.insert(produit).values({ entrepriseId, creeParId, type: "BIEN", nom: "Article", suiviStock: true, ...v }).returning({ id: produit.id }))[0].id);

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-assez-long-pour-etre-valide";
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
  idA = a.id;
  idB = b.id;
  [{ id: adminA }] = await db.insert(utilisateur).values({ entrepriseId: idA, email: `admin-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN", statut: "ACTIF" }).returning({ id: utilisateur.id });
  [{ id: adminB }] = await db.insert(utilisateur).values({ entrepriseId: idB, email: `admin-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN", statut: "ACTIF" }).returning({ id: utilisateur.id });

  p1 = await nouveauProduit(idA, adminA, { nom: "Article 1", codeBarres: W1, stockActuel: 10 });
  p2 = await nouveauProduit(idA, adminA, { nom: "Article 2", codeBarres: W2, stockActuel: 5 });
  await nouveauProduit(idA, adminA, { nom: "Sans code", stockActuel: 9 });
  pB = await nouveauProduit(idB, adminB, { nom: "Article de B", codeBarres: W1, stockActuel: 77 }); // même code chez B

  woo.etat.produits = [
    { id: 101, sku: W1, type: "simple", stock: 99 },
    { id: 102, sku: W2, type: "simple", stock: 99 },
    { id: 103, sku: SITE_SEUL, type: "simple", stock: 4 },
    { id: 104, sku: `VAR-${suffixe}`, type: "variable", stock: null },
  ];
  const [c] = await avecEntreprise(idA, (tx) =>
    tx.insert(connexionBoutique).values({ entrepriseId: idA, type: "WOOCOMMERCE", nom: "Ma boutique Woo", configChiffree: chiffrerConfig({ base: "https://boutique.test", cle: "ck_test", secret: "cs_test" }), creeParId: adminA }).returning({ id: connexionBoutique.id })
  );
  connexionA = c.id;
}, 240_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 240_000);

describe("Boutique WooCommerce — un tour de synchronisation", () => {
  test("avant la connexion : l'aperçu compte les produits reconnus, sans équivalent, et ceux du site que Vertex One ne sait pas relier", async () => {
    const adaptateur = fabrique("WOOCOMMERCE", { cle: "ck_test", secret: "cs_test" })!;
    const apercu = await apercuConnexion(idA, adaptateur);
    expect(apercu).toMatchObject({ reconnus: 2, sansEquivalentSite: 0, sansCodeChezVertexOne: 1 }); // SITE_SEUL n'existe pas chez Vertex One ; le produit à variantes est ignoré
  }, 120_000);

  test("une commande du site fait sortir le stock, puis Vertex One renvoie le stock au site (identifiants Basic bien envoyés)", async () => {
    woo.etat.ordres = [{ id: 9001, number: "1001", status: "processing", date_modified_gmt: date(1), line_items: [{ sku: W1, quantity: 3 }, { sku: W2, quantity: 1 }, { sku: SITE_SEUL, quantity: 1, name: "Article du site" }] }];
    const r = await synchroniserConnexion(idA, connexionA, { fabrique });
    expect(r).toEqual({ enregistrees: 1, annulees: 0, stockEnvoye: 2 });
    expect(await stockDe(idA, p1)).toBe(7);
    expect(await stockDe(idA, p2)).toBe(4);
    expect(stockWoo(W1)).toBe(7); // le site affiche maintenant le stock de Vertex One (il avait 99)
    expect(stockWoo(W2)).toBe(4);
    expect(stockWoo(SITE_SEUL)).toBe(4); // un produit que Vertex One ne connaît pas n'est jamais touché
    expect(woo.etat.autorisation).toBe(`Basic ${Buffer.from("ck_test:cs_test").toString("base64")}`);
    const c = await lireConnexion(idA, connexionA);
    expect(c).toMatchObject({ statut: "ACTIVE", derniereErreur: null });
    expect(c.dernierCycleLe).not.toBeNull();
    expect(c.curseur).toBe(`${woo.etat.ordres[0].date_modified_gmt}Z`);
    // L'historique du stock porte la vente, rattachée à la commande du site.
    const mv = await avecEntreprise(idA, (tx) => tx.select().from(mouvementStock).where(eq(mouvementStock.produitId, p1)));
    expect(mv.filter((m) => m.documentType === "COMMANDE_SITE")).toHaveLength(1);
  }, 240_000);

  test("repasser ne change rien : la même commande relue n'est pas recomptée, et rien n'est renvoyé au site", async () => {
    const lotsAvant = woo.etat.lots;
    const r = await synchroniserConnexion(idA, connexionA, { fabrique });
    expect(r).toEqual({ enregistrees: 0, annulees: 0, stockEnvoye: 0 });
    expect(await stockDe(idA, p1)).toBe(7);
    expect(woo.etat.lots).toBe(lotsAvant); // aucun appel d'écriture inutile
  }, 240_000);

  test("un changement de stock fait dans Vertex One (réception de marchandise) est envoyé au site, et seulement lui", async () => {
    await avecEntreprise(idA, (tx) => tx.update(produit).set({ stockActuel: 20 }).where(eq(produit.id, p1)));
    const r = await synchroniserConnexion(idA, connexionA, { fabrique });
    expect(r.stockEnvoye).toBe(1);
    expect(stockWoo(W1)).toBe(20);
    expect(stockWoo(W2)).toBe(4);
  }, 240_000);

  test("une commande annulée sur le site remet les articles en stock ; une commande non payée est ignorée", async () => {
    woo.etat.ordres.push({ id: 9002, number: "1002", status: "pending", date_modified_gmt: date(2), line_items: [{ sku: W2, quantity: 2 }] });
    expect((await synchroniserConnexion(idA, connexionA, { fabrique })).enregistrees).toBe(0);
    expect(await stockDe(idA, p2)).toBe(4);

    woo.etat.ordres[0] = { ...woo.etat.ordres[0], status: "cancelled", date_modified_gmt: date(3) }; // la commande 1001 est annulée
    const r = await synchroniserConnexion(idA, connexionA, { fabrique });
    expect(r.annulees).toBe(1);
    expect(await stockDe(idA, p2)).toBe(5); // le 1 article revient
    expect(await stockDe(idA, p1)).toBe(23); // 20 + 3
    expect(stockWoo(W2)).toBe(5);
    expect(stockWoo(W1)).toBe(23);
    // Annulée une seconde fois : sans effet.
    woo.etat.ordres[0] = { ...woo.etat.ordres[0], status: "refunded", date_modified_gmt: date(4) };
    expect((await synchroniserConnexion(idA, connexionA, { fabrique })).annulees).toBe(0);
    expect(await stockDe(idA, p1)).toBe(23);
  }, 360_000);

  test("une commande « terminée » ou « en attente de paiement bancaire » sort le stock, comme dans WooCommerce", async () => {
    woo.etat.ordres.push(
      { id: 9003, number: "1003", status: "completed", date_modified_gmt: date(5), line_items: [{ sku: W1, quantity: 1 }] },
      { id: 9004, number: "1004", status: "on-hold", date_modified_gmt: date(5), line_items: [{ sku: W1, quantity: 2 }] }
    );
    expect((await synchroniserConnexion(idA, connexionA, { fabrique })).enregistrees).toBe(2);
    expect(await stockDe(idA, p1)).toBe(20);
  }, 240_000);
});

describe("Boutique WooCommerce — erreurs et isolation", () => {
  test("des clés refusées donnent un message simple, rien ne bouge, puis tout reprend quand les clés redeviennent bonnes", async () => {
    const avant = await stockDe(idA, p1);
    woo.etat.refuser = true;
    const r = await synchroniserConnexion(idA, connexionA, { fabrique });
    expect(r.erreur).toMatch(/refusé vos clés/);
    expect(await stockDe(idA, p1)).toBe(avant);
    expect(await lireConnexion(idA, connexionA)).toMatchObject({ statut: "ERREUR" });
    woo.etat.refuser = false;
    const ok = await synchroniserConnexion(idA, connexionA, { fabrique });
    expect(ok.erreur).toBeUndefined();
    expect(await lireConnexion(idA, connexionA)).toMatchObject({ statut: "ACTIVE", derniereErreur: null });
  }, 240_000);

  test("des identifiants illisibles (secret de l'application changé) demandent de reconnecter, sans exception", async () => {
    const [c] = await avecEntreprise(idA, (tx) => tx.insert(connexionBoutique).values({ entrepriseId: idA, type: "WOOCOMMERCE", nom: "Illisible", configChiffree: "v1.xx.yy.zz", creeParId: adminA }).returning({ id: connexionBoutique.id }));
    const r = await synchroniserConnexion(idA, c.id, { fabrique });
    expect(r.erreur).toMatch(/reconnectez/);
    expect((await lireConnexion(idA, c.id)).statut).toBe("ERREUR");
  }, 120_000);

  test("une connexion « fichier » n'est jamais synchronisée automatiquement", async () => {
    const [c] = await avecEntreprise(idA, (tx) => tx.insert(connexionBoutique).values({ entrepriseId: idA, type: "FICHIER", nom: "Fichiers", creeParId: adminA }).returning({ id: connexionBoutique.id }));
    expect((await synchroniserConnexion(idA, c.id, { fabrique })).erreur).toMatch(/introuvable/);
  }, 120_000);

  test("une autre entreprise ne peut ni synchroniser ni voir cette connexion, et son stock (même code) n'est jamais touché", async () => {
    const r = await synchroniserConnexion(idB, connexionA, { fabrique });
    expect(r.erreur).toMatch(/introuvable/);
    expect(await stockDe(idB, pB)).toBe(77);
    expect(await avecEntreprise(idB, (tx) => tx.select().from(connexionBoutique))).toHaveLength(0);
    expect(await avecEntreprise(idB, (tx) => tx.select().from(stockPousse))).toHaveLength(0);
    // Et B n'a rien reçu des commandes de A.
    const mvB = await avecEntreprise(idB, (tx) => tx.select().from(mouvementStock).where(eq(mouvementStock.produitId, pB)));
    expect(mvB).toHaveLength(0);
  }, 120_000);

  test("les identifiants ne sont jamais en clair en base", async () => {
    const c = await lireConnexion(idA, connexionA);
    expect(c.configChiffree).toBeTruthy();
    expect(c.configChiffree).not.toContain("ck_test");
    expect(c.configChiffree).not.toContain("cs_test");
  }, 120_000);
});

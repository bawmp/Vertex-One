import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, produit, mouvementStock, cleApiEntreprise } from "@/db/schema";
import { genererCle } from "@/lib/api-externe/cle";
import { reinitialiserLimites } from "@/lib/api-externe/limite";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Le chargement des images part « après la réponse » : on garde les tâches pour vérifier qu'elles sont bien programmées, sans rien télécharger.
const taches = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async () => {
  const reel = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...reel, after: (fn: () => unknown) => { taches.push(fn); } };
});
const chargerImages = vi.hoisted(() => vi.fn(async () => ({ chargees: 0, refusees: 0, enAttente: 0, stockageIndisponible: false })));
vi.mock("@/lib/produits/image-distante", async (original) => ({ ...(await original<typeof import("@/lib/produits/image-distante")>()), chargerImagesEnAttente: chargerImages }));

const { POST: PRODUITS } = await import("@/app/api/externe/stock/produits/route");
const { GET: STOCK } = await import("@/app/api/externe/stock/route");

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST StockProduits A ${suffixe}`;
const nomB = `TEST StockProduits B ${suffixe}`;
let idA = "", idB = "", adminA = "", adminB = "", cleA = "", cleSansDroit = "", cleB = "";

async function creerCle(entrepriseId: string, creeParId: string, stock: boolean) {
  const { cle, prefixe, empreinte } = genererCle();
  await avecEntreprise(entrepriseId, (tx) => tx.insert(cleApiEntreprise).values({ entrepriseId, nom: "Site test", prefixe, empreinte, creeParId, autoriseStock: stock }));
  return cle;
}
const appeler = (cle: string | null, corps: unknown, brut?: string) =>
  PRODUITS(new Request("http://localhost/api/externe/stock/produits", { method: "POST", headers: { "Content-Type": "application/json", ...(cle ? { Authorization: `Bearer ${cle}` } : {}) }, body: brut ?? JSON.stringify(corps) }));
const lireStock = (cle: string) => STOCK(new Request("http://localhost/api/externe/stock", { headers: { Authorization: `Bearer ${cle}` } }));
const parCode = (entrepriseId: string, code: string) => avecEntreprise(entrepriseId, async (tx) => (await tx.select().from(produit).where(eq(produit.codeBarres, code)))[0]);

beforeAll(async () => {
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
  idA = a.id;
  idB = b.id;
  [{ id: adminA }] = await db.insert(utilisateur).values({ entrepriseId: idA, email: `admin-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN", statut: "ACTIF" }).returning({ id: utilisateur.id });
  [{ id: adminB }] = await db.insert(utilisateur).values({ entrepriseId: idB, email: `admin-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN", statut: "ACTIF" }).returning({ id: utilisateur.id });
  cleA = await creerCle(idA, adminA, true);
  cleSansDroit = await creerCle(idA, adminA, false);
  cleB = await creerCle(idB, adminB, true);
}, 240_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 240_000);

beforeEach(() => {
  reinitialiserLimites();
  taches.length = 0;
  chargerImages.mockClear();
});

describe("Déclarer des produits depuis le site — droits et validation", () => {
  test("sans clé : 401 ; clé sans le droit « stock » : 403 ; rien n'est créé", async () => {
    expect((await appeler(null, { produits: [{ code: "X", nom: "Xx" }] })).status).toBe(401);
    expect((await appeler(cleSansDroit, { produits: [{ code: `NOPE-${suffixe}`, nom: "Refusé" }] })).status).toBe(403);
    expect(await parCode(idA, `NOPE-${suffixe}`)).toBeUndefined();
  }, 120_000);

  test("corps invalides : 400 avec un message clair", async () => {
    expect((await appeler(cleA, null, "pas du json")).status).toBe(400);
    expect((await appeler(cleA, {})).status).toBe(400);
    expect((await appeler(cleA, { produits: [] })).status).toBe(400);
    expect((await appeler(cleA, { produits: [{ nom: "Sans code" }] })).status).toBe(400);
    expect((await appeler(cleA, { produits: [{ code: "C1", nom: "x" }] })).status).toBe(400); // nom trop court
    expect((await appeler(cleA, { produits: [{ code: "C1", nom: "Valable", prixVente: -5 }] })).status).toBe(400);
    expect((await appeler(cleA, { produits: [{ code: "C1", nom: "Valable", stock: 1.5 }] })).status).toBe(400);
    const trop = Array.from({ length: 51 }, (_, i) => ({ code: `T-${i}`, nom: `Produit ${i}` }));
    const r = await appeler(cleA, { produits: trop });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { erreur: string }).erreur).toMatch(/50 produits/);
  }, 120_000);
});

describe("Déclarer des produits depuis le site — création", () => {
  test("avec un stock : le produit est créé, suivi, avec son stock de départ dans l'historique, au nom de la personne qui a créé la clé ; il apparaît dans la lecture du stock", async () => {
    const code = `NEW-${suffixe}`;
    const r = await appeler(cleA, { produits: [{ code, nom: "Nouveau jouet", prixVente: 5000, prixAchat: 3200, description: "Un jouet", stock: 7 }] });
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ produits: [{ code, statut: "cree", suiviStock: true }], crees: 1, existants: 0 });
    const p = await parCode(idA, code);
    expect(p).toMatchObject({ type: "BIEN", nom: "Nouveau jouet", prixVente: 5000, prixAchat: 3200, description: "Un jouet", suiviStock: true, stockActuel: 7, coutMoyen: 3200, creeParId: adminA, imageSourceUrl: null });
    const mv = await avecEntreprise(idA, (tx) => tx.select().from(mouvementStock).where(eq(mouvementStock.produitId, p.id)));
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({ type: "INITIAL", quantite: 7, stockApres: 7 });
    const lu = (await (await lireStock(cleA)).json()) as { produits: { code: string; disponible: number }[] };
    expect(lu.produits.find((x) => x.code === code)?.disponible).toBe(7);
  }, 240_000);

  test("sans stock (stock vide du côté boutique) : créé SANS suivi, donc absent de la lecture du stock — rien n'est inventé", async () => {
    const code = `SANS-${suffixe}`;
    const r = await appeler(cleA, { produits: [{ code, nom: "Stock inconnu", stock: null }] });
    expect(await r.json()).toMatchObject({ produits: [{ code, statut: "cree", suiviStock: false }] });
    expect(await parCode(idA, code)).toMatchObject({ suiviStock: false, stockActuel: 0 });
    const lu = (await (await lireStock(cleA)).json()) as { produits: { code: string }[] };
    expect(lu.produits.some((x) => x.code === code)).toBe(false);
  }, 240_000);

  test("un code déjà connu (même en majuscules/minuscules) n'est JAMAIS modifié : « existant »", async () => {
    const code = `EXIST-${suffixe}`;
    await appeler(cleA, { produits: [{ code, nom: "Version Vertex One", prixVente: 1000, stock: 3 }] });
    const r = await appeler(cleA, { produits: [{ code: code.toLowerCase(), nom: "Autre nom", prixVente: 9999, stock: 500 }] });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ produits: [{ code: code.toLowerCase(), statut: "existant" }], crees: 0, existants: 1 });
    expect(await parCode(idA, code)).toMatchObject({ nom: "Version Vertex One", prixVente: 1000, stockActuel: 3 });
  }, 240_000);

  test("rejouer le même appel ne crée rien de plus ; le même code deux fois dans un appel n'en crée qu'un", async () => {
    const code = `REJEU-${suffixe}`;
    const corps = { produits: [{ code, nom: "Produit rejoué", stock: 2 }, { code: code.toLowerCase(), nom: "Doublon dans l'appel", stock: 9 }] };
    const premier = (await (await appeler(cleA, corps)).json()) as { crees: number; produits: unknown[] };
    expect(premier.crees).toBe(1);
    expect(premier.produits).toHaveLength(1);
    expect(await (await appeler(cleA, corps)).json()).toMatchObject({ crees: 0, existants: 1 });
    expect(await avecEntreprise(idA, (tx) => tx.select().from(produit).where(eq(produit.codeBarres, code)))).toHaveLength(1);
  }, 240_000);

  test("plusieurs produits en un appel : certains créés, d'autres existants, dans l'ordre", async () => {
    const [a, b] = [`LOT1-${suffixe}`, `LOT2-${suffixe}`];
    await appeler(cleA, { produits: [{ code: a, nom: "Premier lot", stock: 1 }] });
    const r = await appeler(cleA, { produits: [{ code: a, nom: "Premier lot", stock: 1 }, { code: b, nom: "Second lot", stock: 4 }] });
    expect(await r.json()).toMatchObject({ produits: [{ code: a, statut: "existant" }, { code: b, statut: "cree" }], crees: 1, existants: 1 });
  }, 240_000);
});

describe("Déclarer des produits depuis le site — images et isolation", () => {
  test("une adresse d'image HTTPS est gardée et son chargement est programmé APRÈS la réponse ; une adresse non HTTPS est ignorée, sans refuser le produit", async () => {
    const [ok, mauvais] = [`IMG-${suffixe}`, `IMGHTTP-${suffixe}`];
    const r = await appeler(cleA, { produits: [{ code: ok, nom: "Avec image", stock: 1, image: "https://cdn.exemple.cm/a.png" }, { code: mauvais, nom: "Image http", stock: 1, image: "http://cdn.exemple.cm/b.png" }] });
    expect(r.status).toBe(201);
    expect((await parCode(idA, ok)).imageSourceUrl).toBe("https://cdn.exemple.cm/a.png");
    expect((await parCode(idA, mauvais)).imageSourceUrl).toBeNull();
    expect(taches).toHaveLength(1); // programmé, pas exécuté pendant la réponse
    expect(chargerImages).not.toHaveBeenCalled();
    await taches[0]();
    expect(chargerImages).toHaveBeenCalledWith(idA, expect.objectContaining({ limite: 25 }));
  }, 240_000);

  test("aucune image à charger : aucune tâche programmée", async () => {
    await appeler(cleA, { produits: [{ code: `PASIMG-${suffixe}`, nom: "Sans image", stock: 1 }] });
    expect(taches).toHaveLength(0);
  }, 240_000);

  test("le même code dans DEUX entreprises : chacune crée le sien, aucune ne voit ni ne modifie celui de l'autre", async () => {
    const code = `DOUBLE-${suffixe}`;
    await appeler(cleA, { produits: [{ code, nom: "Chez A", prixVente: 100, stock: 1 }] });
    const rb = await appeler(cleB, { produits: [{ code, nom: "Chez B", prixVente: 200, stock: 50 }] });
    expect(await rb.json()).toMatchObject({ produits: [{ code, statut: "cree" }] }); // pour B, ce code était inconnu
    expect(await parCode(idA, code)).toMatchObject({ nom: "Chez A", prixVente: 100, stockActuel: 1, creeParId: adminA });
    expect(await parCode(idB, code)).toMatchObject({ nom: "Chez B", prixVente: 200, stockActuel: 50, creeParId: adminB });
    const luA = (await (await lireStock(cleA)).json()) as { produits: { code: string; disponible: number }[] };
    expect(luA.produits.find((x) => x.code === code)?.disponible).toBe(1);
  }, 240_000);
});

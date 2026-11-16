import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, produit, cleApiEntreprise } from "@/db/schema";
import { genererCle } from "@/lib/api-externe/cle";
import { reinitialiserLimites } from "@/lib/api-externe/limite";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async () => {
  const reel = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...reel, after: () => {} };
});

const { GET: CATALOGUE } = await import("@/app/api/externe/stock/catalogue/route");
const { PATCH: CHANGER } = await import("@/app/api/externe/stock/produits/route");

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Catalogue A ${suffixe}`;
const nomB = `TEST Catalogue B ${suffixe}`;
const codeA = `CAT-${suffixe}-1`;
const codeB = `CAT-${suffixe}-2`;
let idA = "", idB = "", adminA = "", adminB = "", cleA = "", cleSansDroit = "", cleB = "";

async function creerCle(entrepriseId: string, creeParId: string, stock: boolean) {
  const { cle, prefixe, empreinte } = genererCle();
  await avecEntreprise(entrepriseId, (tx) => tx.insert(cleApiEntreprise).values({ entrepriseId, nom: "Site test", prefixe, empreinte, creeParId, autoriseStock: stock }));
  return cle;
}
const lire = (cle: string | null) => CATALOGUE(new Request("http://localhost/api/externe/stock/catalogue", { headers: cle ? { Authorization: `Bearer ${cle}` } : {} }));
const changer = (cle: string | null, corps: unknown, brut?: string) =>
  CHANGER(new Request("http://localhost/api/externe/stock/produits", { method: "PATCH", headers: { "Content-Type": "application/json", ...(cle ? { Authorization: `Bearer ${cle}` } : {}) }, body: brut ?? JSON.stringify(corps) }));
const parCode = (entrepriseId: string, code: string) => avecEntreprise(entrepriseId, async (tx) => (await tx.select().from(produit).where(eq(produit.codeBarres, code)))[0]);
const catalogue = async (cle: string) => ((await (await lire(cle)).json()) as { produits: { code: string; nom: string; description: string | null; prixVente: number; prixAchat: number; actif: boolean; modifieLe: string }[] }).produits;

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
  await avecEntreprise(idA, (tx) =>
    tx.insert(produit).values([
      { entrepriseId: idA, type: "BIEN", nom: "Jouet en bois", description: "Un jouet", prixVente: 5000, prixAchat: 2000, codeBarres: codeA, creeParId: adminA },
      { entrepriseId: idA, type: "BIEN", nom: "Sans code-barres", prixVente: 100, creeParId: adminA },
    ])
  );
  await avecEntreprise(idB, (tx) => tx.insert(produit).values({ entrepriseId: idB, type: "BIEN", nom: "Produit de B", prixVente: 777, codeBarres: codeB, creeParId: adminB }));
}, 240_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 240_000);

beforeEach(() => reinitialiserLimites());

describe("Catalogue lu par le site — droits et isolation", () => {
  test("sans clé : 401 ; clé sans le droit « stock » : 403", async () => {
    expect((await lire(null)).status).toBe(401);
    expect((await lire(cleSansDroit)).status).toBe(403);
  }, 120_000);

  test("seuls les produits AVEC code-barres de CETTE entreprise sont renvoyés, avec leur date de modification", async () => {
    const lus = await catalogue(cleA);
    expect(lus.map((p) => p.code)).toEqual([codeA]);
    expect(lus[0]).toMatchObject({ nom: "Jouet en bois", description: "Un jouet", prixVente: 5000, prixAchat: 2000, actif: true });
    expect(Number.isNaN(Date.parse(lus[0].modifieLe))).toBe(false);
    // L'autre entreprise ne voit jamais ce produit, et inversement.
    expect((await catalogue(cleB)).map((p) => p.code)).toEqual([codeB]);
  }, 120_000);
});

describe("Changements de catalogue renvoyés par le site", () => {
  test("droits et validation : 401, 403, corps invalides → 400, rien n'est modifié", async () => {
    const [p] = await catalogue(cleA);
    expect((await changer(null, { produits: [{ code: codeA, vuLe: p.modifieLe, nom: "Pirate" }] })).status).toBe(401);
    expect((await changer(cleSansDroit, { produits: [{ code: codeA, vuLe: p.modifieLe, nom: "Pirate" }] })).status).toBe(403);
    expect((await changer(cleA, null, "pas du json")).status).toBe(400);
    expect((await changer(cleA, { produits: [] })).status).toBe(400);
    expect((await changer(cleA, { produits: [{ code: codeA, nom: "Sans vuLe" }] })).status).toBe(400);
    expect((await changer(cleA, { produits: [{ code: codeA, vuLe: "pas une date", nom: "Valable" }] })).status).toBe(400);
    expect((await changer(cleA, { produits: [{ code: codeA, vuLe: p.modifieLe, prixVente: -1 }] })).status).toBe(400);
    expect((await changer(cleA, { produits: [{ code: codeA, vuLe: p.modifieLe, prixVente: 10.5 }] })).status).toBe(400);
    expect((await changer(cleA, { produits: [{ code: codeA, vuLe: p.modifieLe, actif: "oui" }] })).status).toBe(400);
    expect((await parCode(idA, codeA)).nom).toBe("Jouet en bois");
  }, 120_000);

  test("un changement vu à jour est appliqué (nom, description, prix, actif) et renvoie la nouvelle date ; seuls les champs envoyés bougent", async () => {
    const [avant] = await catalogue(cleA);
    const r = await changer(cleA, { produits: [{ code: codeA.toLowerCase(), vuLe: avant.modifieLe, nom: "Jouet en bois massif", prixVente: 6500, actif: false }] });
    expect(r.status).toBe(200);
    const corps = (await r.json()) as { produits: { code: string; statut: string; modifieLe?: string }[]; modifies: number };
    expect(corps.modifies).toBe(1);
    expect(corps.produits[0].statut).toBe("modifie");
    const [apres] = await catalogue(cleA);
    expect(apres).toMatchObject({ nom: "Jouet en bois massif", prixVente: 6500, prixAchat: 2000, description: "Un jouet", actif: false });
    expect(apres.modifieLe).toBe(corps.produits[0].modifieLe);
    expect(Date.parse(apres.modifieLe)).toBeGreaterThan(Date.parse(avant.modifieLe));
  }, 120_000);

  test("même valeur renvoyée : « identique », la date de modification ne bouge pas", async () => {
    const [avant] = await catalogue(cleA);
    const r = await changer(cleA, { produits: [{ code: codeA, vuLe: avant.modifieLe, nom: avant.nom, prixVente: avant.prixVente }] });
    const corps = (await r.json()) as { produits: { statut: string }[]; modifies: number };
    expect(corps.produits[0].statut).toBe("identique");
    expect(corps.modifies).toBe(0);
    expect((await catalogue(cleA))[0].modifieLe).toBe(avant.modifieLe);
  }, 120_000);

  test("CONFLIT : le produit a changé chez Vertex One depuis ce que le site avait vu → rien n'est écrit", async () => {
    const [vu] = await catalogue(cleA);
    // Quelqu'un modifie le prix dans Vertex One entre-temps.
    await avecEntreprise(idA, (tx) => tx.update(produit).set({ prixVente: 9999 }).where(eq(produit.codeBarres, codeA)));
    const r = await changer(cleA, { produits: [{ code: codeA, vuLe: vu.modifieLe, nom: "Écrasement refusé", prixVente: 1 }] });
    const corps = (await r.json()) as { produits: { statut: string; modifieLe?: string }[] };
    expect(corps.produits[0].statut).toBe("conflit");
    expect(corps.produits[0].modifieLe && Date.parse(corps.produits[0].modifieLe)).toBeGreaterThan(Date.parse(vu.modifieLe));
    const [apres] = await catalogue(cleA);
    expect(apres).toMatchObject({ nom: "Jouet en bois massif", prixVente: 9999 });
  }, 120_000);

  test("la date de modification ne bouge PAS pour un changement qui ne concerne pas le catalogue (stock, seuil d'alerte)", async () => {
    const [avant] = await catalogue(cleA);
    await avecEntreprise(idA, (tx) => tx.update(produit).set({ seuilAlerte: 3, stockActuel: 12 }).where(eq(produit.codeBarres, codeA)));
    expect((await catalogue(cleA))[0].modifieLe).toBe(avant.modifieLe);
  }, 120_000);

  test("code inconnu : « inconnu » ; un code d'une AUTRE entreprise est inconnu aussi, et son produit n'est jamais modifié", async () => {
    const [vu] = await catalogue(cleA);
    const r = await changer(cleA, { produits: [{ code: "N-EXISTE-PAS", vuLe: vu.modifieLe, nom: "Fantôme" }, { code: codeB, vuLe: vu.modifieLe, nom: "Vol", prixVente: 1 }] });
    const corps = (await r.json()) as { produits: { code: string; statut: string }[] };
    expect(corps.produits.map((p) => p.statut)).toEqual(["inconnu", "inconnu"]);
    expect(await parCode(idB, codeB)).toMatchObject({ nom: "Produit de B", prixVente: 777 });
  }, 120_000);

  test("une description vide efface la description (null)", async () => {
    const [vu] = await catalogue(cleA);
    const r = await changer(cleA, { produits: [{ code: codeA, vuLe: vu.modifieLe, description: "" }] });
    expect(((await r.json()) as { produits: { statut: string }[] }).produits[0].statut).toBe("modifie");
    expect((await catalogue(cleA))[0].description).toBeNull();
  }, 120_000);
});

describe("Produit masqué", () => {
  test("un nouveau produit est actif par défaut", async () => {
    const lu = await parCode(idA, codeA);
    expect(lu).toBeDefined();
    // actif vaut vrai par défaut pour un nouveau produit.
    const [neuf] = await avecEntreprise(idA, (tx) => tx.insert(produit).values({ entrepriseId: idA, type: "BIEN", nom: "Neuf", codeBarres: `NEUF-${suffixe}`, creeParId: adminA }).returning());
    expect(neuf.actif).toBe(true);
  }, 120_000);
});

import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, produit, depot, stockDepot, mouvementStock, commandeSite, cleApiEntreprise } from "@/db/schema";
import { genererCle } from "@/lib/api-externe/cle";
import { reinitialiserLimites } from "@/lib/api-externe/limite";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { GET } = await import("@/app/api/externe/stock/route");
const { POST: COMMANDE } = await import("@/app/api/externe/stock/commandes/route");
const { POST: ANNULATION } = await import("@/app/api/externe/stock/commandes/annulation/route");

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST StockSite A ${suffixe}`;
const nomB = `TEST StockSite B ${suffixe}`;
const nomC = `TEST StockSite C ${suffixe}`;
// Les codes se dérivent de l'exécution : jamais codés en dur (un résidu d'un run interrompu ne doit pas entrer en collision).
const CODE = `ENF-${suffixe}`;
const CODE_DEPOT = `DEP-${suffixe}`;
let idA = "", idB = "", idC = "", adminA = "", adminB = "", adminC = "";
let cleA = "", cleAId = "", cleSansDroit = "", cleRevoquee = "", cleB = "", cleC = "", cleDepot = "", cleDepotId = "";
let produitA = "", produitB = "", produitDepotA = "", depotBoutique = "";
let n = 0;

async function creerCle(entrepriseId: string, creeParId: string, options: { stock: boolean; revoquee?: boolean; depotStockId?: string }) {
  const { cle, prefixe, empreinte } = genererCle();
  const [ligne] = await avecEntreprise(entrepriseId, (tx) =>
    tx
      .insert(cleApiEntreprise)
      .values({ entrepriseId, nom: "Site test", prefixe, empreinte, creeParId, autoriseStock: options.stock, revoqueeLe: options.revoquee ? new Date() : null, depotStockId: options.depotStockId ?? null })
      .returning({ id: cleApiEntreprise.id })
  );
  return { cle, id: ligne.id };
}

const entetes = (cle: string | null) => ({ "Content-Type": "application/json", ...(cle ? { Authorization: `Bearer ${cle}` } : {}) });
const lire = (cle: string | null, chemin = "") => GET(new Request(`http://localhost/api/externe/stock${chemin}`, { headers: entetes(cle) }));
const commander = (cle: string | null, corps: unknown, brut?: string) =>
  COMMANDE(new Request("http://localhost/api/externe/stock/commandes", { method: "POST", headers: entetes(cle), body: brut ?? JSON.stringify(corps) }));
const annuler = (cle: string | null, corps: unknown) =>
  ANNULATION(new Request("http://localhost/api/externe/stock/commandes/annulation", { method: "POST", headers: entetes(cle), body: JSON.stringify(corps) }));
const ref = () => `cmd-${suffixe}-${(n += 1)}`;
const stockDe = (entrepriseId: string, id: string) => avecEntreprise(entrepriseId, async (tx) => (await tx.select({ s: produit.stockActuel }).from(produit).where(eq(produit.id, id)))[0].s);
const mouvements = (entrepriseId: string, produitId: string) => avecEntreprise(entrepriseId, (tx) => tx.select().from(mouvementStock).where(eq(mouvementStock.produitId, produitId)));
const nouveauProduit = (entrepriseId: string, creeParId: string, valeurs: Partial<typeof produit.$inferInsert>) =>
  avecEntreprise(entrepriseId, async (tx) => (await tx.insert(produit).values({ entrepriseId, creeParId, type: "BIEN", nom: "Article test", suiviStock: true, ...valeurs }).returning({ id: produit.id }))[0].id);

beforeAll(async () => {
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
  const [c] = await db.insert(entreprise).values({ nom: nomC, secteurProfil: "agence", statutAbonnement: "suspendu" }).returning({ id: entreprise.id });
  idA = a.id;
  idB = b.id;
  idC = c.id;
  [{ id: adminA }] = await db.insert(utilisateur).values({ entrepriseId: idA, email: `admin-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN", statut: "ACTIF" }).returning({ id: utilisateur.id });
  [{ id: adminB }] = await db.insert(utilisateur).values({ entrepriseId: idB, email: `admin-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN", statut: "ACTIF" }).returning({ id: utilisateur.id });
  [{ id: adminC }] = await db.insert(utilisateur).values({ entrepriseId: idC, email: `admin-c-${suffixe}@vertexone.test`, nomComplet: "Admin C", role: "ADMIN", statut: "ACTIF" }).returning({ id: utilisateur.id });

  // Même code dans les DEUX entreprises : un appel de A ne doit jamais toucher le produit de B.
  produitA = await nouveauProduit(idA, adminA, { nom: "Jouet A", codeBarres: CODE, stockActuel: 10 });
  produitB = await nouveauProduit(idB, adminB, { nom: "Jouet B", codeBarres: CODE, stockActuel: 50 });
  await nouveauProduit(idA, adminA, { nom: "Service non suivi", codeBarres: `NS-${suffixe}`, suiviStock: false, stockActuel: 0 });
  await nouveauProduit(idA, adminA, { nom: "Article sans code", stockActuel: 5 });
  await nouveauProduit(idA, adminA, { nom: "Kit du site", codeBarres: `KIT-${suffixe}`, estKit: true, stockActuel: 0 });

  // Deuxième dépôt : une connexion peut ne voir que le stock de sa boutique.
  depotBoutique = await avecEntreprise(idA, async (tx) => (await tx.insert(depot).values({ entrepriseId: idA, nom: "Boutique", principal: false }).returning({ id: depot.id }))[0].id);
  produitDepotA = await nouveauProduit(idA, adminA, { nom: "Article en boutique", codeBarres: CODE_DEPOT, stockActuel: 10 });
  await avecEntreprise(idA, (tx) => tx.insert(stockDepot).values({ entrepriseId: idA, produitId: produitDepotA, depotId: depotBoutique, quantite: 4 }));

  ({ cle: cleA, id: cleAId } = await creerCle(idA, adminA, { stock: true }));
  ({ cle: cleSansDroit } = await creerCle(idA, adminA, { stock: false }));
  ({ cle: cleRevoquee } = await creerCle(idA, adminA, { stock: true, revoquee: true }));
  ({ cle: cleDepot, id: cleDepotId } = await creerCle(idA, adminA, { stock: true, depotStockId: depotBoutique }));
  ({ cle: cleB } = await creerCle(idB, adminB, { stock: true }));
  ({ cle: cleC } = await creerCle(idC, adminC, { stock: true }));
}, 240_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
  await supprimerEntrepriseDeTest(nomC);
}, 240_000);

beforeEach(() => reinitialiserLimites());

describe("Boutique connectée — authentification", () => {
  test("sans clé, clé inconnue ou clé révoquée : 401 identique, rien ne sort", async () => {
    expect((await lire(null)).status).toBe(401);
    expect((await lire("vo_" + "x".repeat(43))).status).toBe(401);
    expect((await lire(cleRevoquee)).status).toBe(401);
    expect((await commander(cleRevoquee, { reference: ref(), lignes: [{ code: CODE, quantite: 1 }] })).status).toBe(401);
    expect(await stockDe(idA, produitA)).toBe(10);
  });

  test("une clé qui n'a pas le droit « stock » est refusée (403) partout", async () => {
    expect((await lire(cleSansDroit)).status).toBe(403);
    expect((await commander(cleSansDroit, { reference: ref(), lignes: [{ code: CODE, quantite: 1 }] })).status).toBe(403);
    expect((await annuler(cleSansDroit, { reference: "x" })).status).toBe(403);
    expect(await stockDe(idA, produitA)).toBe(10);
  });

  test("abonnement suspendu : 402", async () => {
    expect((await lire(cleC)).status).toBe(402);
  });

  test("corps invalides : 400 avec un message clair", async () => {
    expect((await commander(cleA, null, "pas du json")).status).toBe(400);
    expect((await commander(cleA, { lignes: [{ code: CODE, quantite: 1 }] })).status).toBe(400);
    expect((await commander(cleA, { reference: ref(), lignes: [] })).status).toBe(400);
    expect((await commander(cleA, { reference: ref(), lignes: [{ code: CODE, quantite: 0 }] })).status).toBe(400);
    expect((await commander(cleA, { reference: ref(), lignes: [{ code: CODE, quantite: 1.5 }] })).status).toBe(400);
    const r = await commander(cleA, { reference: ref(), lignes: [{ code: "", quantite: 1 }] });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { erreur: string }).erreur).toMatch(/code/);
    expect(await stockDe(idA, produitA)).toBe(10);
  });
});

describe("Boutique connectée — lecture du stock", () => {
  test("seuls les produits suivis qui ont un code, de SON entreprise, sont listés (jamais ceux d'une autre)", async () => {
    const r = await lire(cleA);
    expect(r.status).toBe(200);
    const corps = (await r.json()) as { produits: { code: string; nom: string; disponible: number }[] };
    const codes = corps.produits.map((p) => p.code);
    expect(codes).toContain(CODE);
    expect(corps.produits.find((p) => p.code === CODE)).toEqual({ code: CODE, nom: "Jouet A", disponible: 10 });
    expect(JSON.stringify(corps)).not.toContain("Jouet B"); // le produit de B (même code, stock 50) n'apparaît jamais
    expect(codes).not.toContain(`NS-${suffixe}`); // non suivi
    expect(codes).not.toContain(`KIT-${suffixe}`); // un kit n'a pas de stock propre
    expect(corps.produits.every((p) => p.nom !== "Article sans code")).toBe(true);
    // Et B ne voit que le sien.
    const b = (await (await lire(cleB)).json()) as { produits: { code: string; disponible: number }[] };
    expect(b.produits.find((p) => p.code === CODE)?.disponible).toBe(50);
    expect(b.produits.some((p) => p.code === CODE_DEPOT)).toBe(false);
  });

  test("?codes= restreint la lecture, sans tenir compte de la casse", async () => {
    const r = await lire(cleA, `?codes=${CODE.toLowerCase()}`);
    const corps = (await r.json()) as { produits: { code: string }[] };
    expect(corps.produits.map((p) => p.code)).toEqual([CODE]);
  });

  test("une connexion liée à un dépôt ne voit que le stock de ce dépôt", async () => {
    const principal = (await (await lire(cleA, `?codes=${CODE_DEPOT}`)).json()) as { produits: { disponible: number }[]; depot: string };
    expect(principal.produits[0].disponible).toBe(6); // 10 au total − 4 rangés en boutique
    const boutique = (await (await lire(cleDepot, `?codes=${CODE_DEPOT}`)).json()) as { produits: { disponible: number }[]; depot: string };
    expect(boutique.depot).toBe("Boutique");
    expect(boutique.produits[0].disponible).toBe(4);
  });
});

describe("Boutique connectée — commandes du site", () => {
  test("une commande fait sortir le stock de Vertex One, laisse un mouvement d'historique et répond avec le stock restant", async () => {
    const reference = ref();
    const r = await commander(cleA, { reference, lignes: [{ code: CODE, quantite: 3 }] });
    expect(r.status).toBe(201);
    const corps = (await r.json()) as { lignes: { code: string; statut: string; disponible?: number }[]; aVerifier?: string[]; doublon: boolean };
    expect(corps.lignes[0]).toMatchObject({ code: CODE, quantite: 3, statut: "ok", nom: "Jouet A", disponible: 7 });
    expect(JSON.stringify(corps)).not.toContain(produitA); // jamais l'identifiant interne d'un produit
    expect(corps.aVerifier).toBeUndefined();
    expect(await stockDe(idA, produitA)).toBe(7);
    expect(await stockDe(idB, produitB)).toBe(50); // l'autre entreprise n'a pas bougé
    const mv = (await mouvements(idA, produitA)).filter((m) => m.documentType === "COMMANDE_SITE");
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({ type: "VENTE", quantite: -3, stockApres: 7 });
    // L'historique de B ne contient rien de cette commande.
    expect((await mouvements(idB, produitB)).filter((m) => m.documentType === "COMMANDE_SITE")).toHaveLength(0);
  });

  test("renvoyer la même référence ne fait JAMAIS sortir le stock deux fois (200, doublon)", async () => {
    const reference = ref();
    const avant = await stockDe(idA, produitA);
    expect((await commander(cleA, { reference, lignes: [{ code: CODE, quantite: 2 }] })).status).toBe(201);
    const second = await commander(cleA, { reference, lignes: [{ code: CODE, quantite: 2 }] });
    expect(second.status).toBe(200);
    expect(((await second.json()) as { doublon: boolean }).doublon).toBe(true);
    expect(await stockDe(idA, produitA)).toBe(avant - 2);
  });

  test("deux envois simultanés de la même commande ne sortent le stock qu'une fois", async () => {
    const reference = ref();
    const avant = await stockDe(idA, produitA);
    const reponses = await Promise.all([1, 2, 3].map(() => commander(cleA, { reference, lignes: [{ code: CODE, quantite: 1 }] })));
    expect(reponses.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(await stockDe(idA, produitA)).toBe(avant - 1);
  }, 120_000);

  test("un code inconnu ou un produit non suivi ne bloque pas la commande : signalé, rien ne sort pour eux", async () => {
    const avant = await stockDe(idA, produitA);
    const r = await commander(cleA, { reference: ref(), lignes: [{ code: `INCONNU-${suffixe}`, quantite: 2 }, { code: `NS-${suffixe}`, quantite: 1 }, { code: CODE, quantite: 1 }] });
    expect(r.status).toBe(201);
    const corps = (await r.json()) as { lignes: { code: string; statut: string }[]; aVerifier: string[] };
    expect(corps.lignes.map((l) => l.statut)).toEqual(["inconnu", "non_suivi", "ok"]);
    expect(corps.aVerifier).toEqual([`INCONNU-${suffixe}`, `NS-${suffixe}`]);
    expect(await stockDe(idA, produitA)).toBe(avant - 1);
  });

  test("un code d'une AUTRE entreprise est inconnu : jamais retrouvé chez elle", async () => {
    // Le produit de A n'a de code que chez A : B le déclare, il est inconnu côté B.
    const r = await commander(cleB, { reference: ref(), lignes: [{ code: CODE_DEPOT, quantite: 1 }] });
    const corps = (await r.json()) as { lignes: { statut: string }[] };
    expect(corps.lignes[0].statut).toBe("inconnu");
    expect(await stockDe(idA, produitDepotA)).toBe(10);
  });

  test("le code se retrouve sans tenir compte de la casse, et un code répété est additionné", async () => {
    const avant = await stockDe(idA, produitA);
    const r = await commander(cleA, { reference: ref(), lignes: [{ code: CODE.toLowerCase(), quantite: 1 }, { code: CODE, quantite: 2 }] });
    const corps = (await r.json()) as { lignes: { quantite: number; statut: string }[] };
    expect(corps.lignes).toHaveLength(1);
    expect(corps.lignes[0]).toMatchObject({ quantite: 3, statut: "ok" });
    expect(await stockDe(idA, produitA)).toBe(avant - 3);
  });

  test("une commande peut faire passer le stock sous zéro (jamais refusée : le client a déjà commandé)", async () => {
    const id = await nouveauProduit(idA, adminA, { nom: "Dernier article", codeBarres: `DER-${suffixe}`, stockActuel: 1 });
    const r = await commander(cleA, { reference: ref(), lignes: [{ code: `DER-${suffixe}`, quantite: 2 }] });
    expect(r.status).toBe(201);
    expect(await stockDe(idA, id)).toBe(-1);
    const lu = (await (await lire(cleA, `?codes=DER-${suffixe}`)).json()) as { produits: { disponible: number }[] };
    expect(lu.produits[0].disponible).toBe(0); // le site lit « rupture », jamais un nombre négatif
  });

  test("la commande sort le stock du dépôt de la connexion", async () => {
    const r = await commander(cleDepot, { reference: ref(), lignes: [{ code: CODE_DEPOT, quantite: 3 }] });
    expect(r.status).toBe(201);
    expect(((await r.json()) as { lignes: { disponible: number }[] }).lignes[0].disponible).toBe(1);
    const lignes = await avecEntreprise(idA, (tx) => tx.select().from(stockDepot).where(and(eq(stockDepot.produitId, produitDepotA), eq(stockDepot.depotId, depotBoutique))));
    expect(lignes[0].quantite).toBe(1);
    expect(await stockDe(idA, produitDepotA)).toBe(7);
    // Le dépôt principal, lui, voit toujours ses 6.
    const principal = (await (await lire(cleA, `?codes=${CODE_DEPOT}`)).json()) as { produits: { disponible: number }[] };
    expect(principal.produits[0].disponible).toBe(6);
  });

  test("la commande est gardée avec sa connexion, et l'autre entreprise ne la voit pas (RLS)", async () => {
    const reference = ref();
    await commander(cleA, { reference, lignes: [{ code: CODE, quantite: 1 }] });
    const chezA = await avecEntreprise(idA, (tx) => tx.select().from(commandeSite).where(eq(commandeSite.reference, reference)));
    expect(chezA).toHaveLength(1);
    expect(chezA[0].cleId).toBe(cleAId);
    const chezB = await avecEntreprise(idB, (tx) => tx.select().from(commandeSite).where(eq(commandeSite.reference, reference)));
    expect(chezB).toHaveLength(0);
    // Même sous B, impossible d'écrire une commande au nom de A.
    await expect(avecEntreprise(idB, (tx) => tx.insert(commandeSite).values({ entrepriseId: idA, cleId: null, source: "x", reference: "intrus", lignes: [] }))).rejects.toThrow();
  });
});

describe("Boutique connectée — annulation", () => {
  test("annuler remet les articles en stock, une seule fois", async () => {
    const reference = ref();
    const avant = await stockDe(idA, produitA);
    await commander(cleA, { reference, lignes: [{ code: CODE, quantite: 4 }] });
    expect(await stockDe(idA, produitA)).toBe(avant - 4);

    const r = await annuler(cleA, { reference });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ statut: "ANNULEE", doublon: false, produitsRemisEnStock: 1 });
    expect(await stockDe(idA, produitA)).toBe(avant);

    const encore = await annuler(cleA, { reference });
    expect(encore.status).toBe(200);
    expect(((await encore.json()) as { doublon: boolean }).doublon).toBe(true);
    expect(await stockDe(idA, produitA)).toBe(avant);

    const mv = (await mouvements(idA, produitA)).filter((m) => m.motif === "ANNULATION");
    expect(mv.length).toBeGreaterThanOrEqual(1);
  });

  test("une référence inconnue (ou celle d'une autre connexion) donne 404 et ne touche à rien", async () => {
    expect((await annuler(cleA, { reference: `jamais-vue-${suffixe}` })).status).toBe(404);
    const reference = ref();
    await commander(cleA, { reference, lignes: [{ code: CODE, quantite: 1 }] });
    const avant = await stockDe(idA, produitA);
    expect((await annuler(cleB, { reference })).status).toBe(404); // B ne peut pas annuler la commande de A
    expect((await annuler(cleDepot, { reference })).status).toBe(404); // une autre clé de A non plus : chaque connexion a ses références
    expect(await stockDe(idA, produitA)).toBe(avant);
    expect(cleDepotId).toBeTruthy();
  });
});

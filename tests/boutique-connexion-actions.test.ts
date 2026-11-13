import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, produit, depot, connexionBoutique, stockPousse } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";
import { fauxWooCommerce } from "./aide-woocommerce";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock("@/lib/i18n/langue", () => ({ getT: async () => Object.assign((texte: string, v?: Record<string, string | number>) => (v ? texte.replace(/\{(\w+)\}/g, (b, k: string) => String(v[k] ?? b)) : texte), { locale: "fr-FR" }) }));
let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

// Le réseau est remplacé par le faux WooCommerce ; la garde contre les adresses internes a ses propres tests (boutique-securite).
const woo = fauxWooCommerce();
vi.mock("@/lib/boutique/adresse-sure", async (original) => ({
  ...(await original<typeof import("@/lib/boutique/adresse-sure")>()),
  verifierHotePublic: async () => ({ ok: true }),
  creerAppeleur: () => woo.appeler,
}));

const { verifierWooCommerce, connecterWooCommerce, deconnecterBoutique, definirDepotBoutique, synchroniserMaintenant } = await import("@/lib/actions/boutique-connexion");

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST BoutiqueAction A ${suffixe}`;
const nomB = `TEST BoutiqueAction B ${suffixe}`;
const W1 = `W1-${suffixe}`;
let idA = "", idB = "", adminA = "", managerA = "", adminB = "", p1 = "", depotA = "", depotB = "";

const formulaire = (valeurs: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(valeurs)) f.set(k, v);
  return f;
};
const BON = { adresse: "https://boutique.test", cle: "ck_cle_de_test_123", secret: "cs_secret_de_test_456" };
const connexionsDe = (entrepriseId: string) => avecEntreprise(entrepriseId, (tx) => tx.select().from(connexionBoutique));
const entrepriseDe = (id: string) => db.select().from(entreprise).where(eq(entreprise.id, id)).then((l) => l[0]);

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-assez-long-pour-etre-valide";
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
  idA = a.id;
  idB = b.id;
  const crees = await db
    .insert(utilisateur)
    .values([
      { entrepriseId: idA, email: `admin-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN", statut: "ACTIF" },
      { entrepriseId: idA, email: `manager-a-${suffixe}@vertexone.test`, nomComplet: "Manager A", role: "MANAGER", statut: "ACTIF" },
      { entrepriseId: idB, email: `admin-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN", statut: "ACTIF" },
    ])
    .returning({ id: utilisateur.id, email: utilisateur.email });
  adminA = crees.find((u) => u.email.startsWith("admin-a"))!.id;
  managerA = crees.find((u) => u.email.startsWith("manager-a"))!.id;
  adminB = crees.find((u) => u.email.startsWith("admin-b"))!.id;
  depotA = await avecEntreprise(idA, async (tx) => (await tx.insert(depot).values({ entrepriseId: idA, nom: "Boutique A", principal: false }).returning({ id: depot.id }))[0].id);
  depotB = await avecEntreprise(idB, async (tx) => (await tx.insert(depot).values({ entrepriseId: idB, nom: "Boutique B", principal: false }).returning({ id: depot.id }))[0].id);
  p1 = await avecEntreprise(idA, async (tx) => (await tx.insert(produit).values({ entrepriseId: idA, creeParId: adminA, type: "BIEN", nom: "Article 1", suiviStock: true, stockActuel: 10, codeBarres: W1 }).returning({ id: produit.id }))[0].id);
  woo.etat.produits = [{ id: 101, sku: W1, type: "simple", stock: 99 }, { id: 102, sku: `SEUL-${suffixe}`, type: "simple", stock: 3 }];
}, 240_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 240_000);

describe("Connecter WooCommerce — refus avant tout appel", () => {
  test("un Manager ne peut ni vérifier ni connecter", async () => {
    connecte = { utilisateurId: managerA, entrepriseId: idA, role: "MANAGER" };
    expect((await verifierWooCommerce(null, formulaire(BON)))?.erreur).toMatch(/administrateur/i);
    expect((await connecterWooCommerce(null, formulaire({ ...BON, accepte: "on" })))?.erreur).toMatch(/administrateur/i);
    expect(woo.etat.requetes).toHaveLength(0);
    expect(await connexionsDe(idA)).toHaveLength(0);
  }, 120_000);

  test("adresse non sécurisée, numérique ou locale, clés trop courtes : refusées sans aucune requête", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    for (const adresse of ["http://boutique.test", "https://127.0.0.1", "https://localhost", "https://user:mdp@boutique.test", "https://boutique.test:8443", ""]) {
      expect((await verifierWooCommerce(null, formulaire({ ...BON, adresse })))?.erreur, adresse).toBeTruthy();
    }
    expect((await verifierWooCommerce(null, formulaire({ ...BON, cle: "x" })))?.erreur).toMatch(/Clé client/);
    expect((await verifierWooCommerce(null, formulaire({ ...BON, secret: "" })))?.erreur).toMatch(/Secret client/);
    expect(woo.etat.requetes).toHaveLength(0);
  }, 120_000);

  test("sans la case cochée (« je comprends que le stock de mon site sera remplacé »), rien n'est connecté", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    expect((await connecterWooCommerce(null, formulaire(BON)))?.erreur).toMatch(/Cochez la case/);
    expect(await connexionsDe(idA)).toHaveLength(0);
    expect(woo.etat.requetes).toHaveLength(0);
  }, 120_000);
});

describe("Connecter WooCommerce — vérification puis connexion", () => {
  test("des clés refusées par le site donnent un message simple et n'enregistrent rien", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    woo.etat.refuser = true;
    const r = await verifierWooCommerce(null, formulaire(BON));
    const c = await connecterWooCommerce(null, formulaire({ ...BON, accepte: "on" }));
    woo.etat.refuser = false;
    expect(r?.erreur).toMatch(/refusé vos clés/);
    expect(r?.apercu).toBeUndefined();
    expect(c?.erreur).toMatch(/refusé vos clés/);
    expect(c?.connecte).toBeUndefined();
    expect(await connexionsDe(idA)).toHaveLength(0);
  }, 120_000);

  test("la vérification montre ce qui va se passer, sans rien enregistrer ni modifier sur le site", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    const lotsAvant = woo.etat.lots;
    const r = await verifierWooCommerce(null, formulaire(BON));
    expect(r?.erreur).toBeUndefined();
    expect(r?.apercu).toMatchObject({ reconnus: 1, sansEquivalentSite: 0, sansCodeChezVertexOne: 1 });
    expect(woo.etat.lots).toBe(lotsAvant); // aucune écriture sur le site
    expect(await connexionsDe(idA)).toHaveLength(0);
    expect(woo.etat.produits[0].stock).toBe(99);
  }, 120_000);

  test("la connexion chiffre les identifiants, marque l'entreprise pour le worker et fait un premier échange : le site prend le stock de Vertex One", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    const r = await connecterWooCommerce(null, formulaire({ ...BON, accepte: "on", nom: "Ma boutique" }));
    expect(r?.erreur).toBeUndefined();
    expect(r?.connecte).toMatchObject({ nom: "Ma boutique", resultat: { stockEnvoye: 1 } });
    expect(woo.etat.produits[0].stock).toBe(10); // le site (99) affiche maintenant le stock de Vertex One
    expect(woo.etat.produits[1].stock).toBe(3); // un produit non relié n'est pas touché

    const [c] = await connexionsDe(idA);
    expect(c).toMatchObject({ type: "WOOCOMMERCE", nom: "Ma boutique", statut: "ACTIVE", archiveeLe: null });
    expect(c.configChiffree).toBeTruthy();
    expect(c.configChiffree).not.toContain("ck_cle_de_test");
    expect(c.configChiffree).not.toContain("cs_secret_de_test");
    expect(new Date(c.curseur!).getTime()).toBeLessThanOrEqual(Date.now() + 5_000); // démarre à la connexion : l'historique du site n'est jamais rejoué
    expect((await entrepriseDe(idA)).synchroBoutiqueActive).toBe(true);
    expect((await entrepriseDe(idB)).synchroBoutiqueActive).toBe(false);
  }, 240_000);

  test("sans nom saisi, le nom du site est déduit de son adresse", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    const r = await connecterWooCommerce(null, formulaire({ ...BON, adresse: "https://www.autre-site.test/", accepte: "on" }));
    expect(r?.connecte?.nom).toBe("autre-site.test");
  }, 240_000);

  test("le dépôt d'une autre entreprise est refusé ; le sien est accepté", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    const avant = (await connexionsDe(idA)).length;
    expect((await connecterWooCommerce(null, formulaire({ ...BON, accepte: "on", depot: depotB })))?.erreur).toMatch(/dépôt/);
    expect((await connexionsDe(idA)).length).toBe(avant);
    const ok = await connecterWooCommerce(null, formulaire({ ...BON, accepte: "on", nom: "Avec dépôt", depot: depotA }));
    expect(ok?.connecte).toBeTruthy();
    expect((await connexionsDe(idA)).find((c) => c.nom === "Avec dépôt")?.depotId).toBe(depotA);
  }, 240_000);
});

describe("Gérer une connexion — isolation entre entreprises", () => {
  test("une autre entreprise ne voit pas la connexion et ne peut ni la synchroniser, ni la déconnecter, ni changer son dépôt", async () => {
    const [c] = (await connexionsDe(idA)).filter((x) => x.nom === "Ma boutique");
    connecte = { utilisateurId: adminB, entrepriseId: idB, role: "ADMIN" };
    expect(await connexionsDe(idB)).toHaveLength(0);
    expect((await synchroniserMaintenant(c.id)).erreur).toMatch(/introuvable/);
    expect((await definirDepotBoutique(c.id, depotB)).erreur).toMatch(/introuvable/);
    await deconnecterBoutique(c.id);
    const apres = (await connexionsDe(idA)).find((x) => x.id === c.id)!;
    expect(apres.archiveeLe).toBeNull();
    expect(apres.configChiffree).toBeTruthy();
  }, 240_000);

  test("changer le dépôt : seulement un dépôt de SON entreprise, et le stock déjà envoyé est à renvoyer", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    const [c] = (await connexionsDe(idA)).filter((x) => x.nom === "Ma boutique");
    expect(await avecEntreprise(idA, (tx) => tx.select().from(stockPousse).where(eq(stockPousse.connexionId, c.id)))).toHaveLength(1);
    expect((await definirDepotBoutique(c.id, depotB)).erreur).toMatch(/dépôt/);
    expect((await definirDepotBoutique(c.id, depotA)).erreur).toBeUndefined();
    expect((await connexionsDe(idA)).find((x) => x.id === c.id)?.depotId).toBe(depotA);
    expect(await avecEntreprise(idA, (tx) => tx.select().from(stockPousse).where(eq(stockPousse.connexionId, c.id)))).toHaveLength(0);
  }, 240_000);

  test("« Synchroniser maintenant » répond avec le détail ; déconnecter efface les identifiants et arrête les échanges", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    const [c] = (await connexionsDe(idA)).filter((x) => x.nom === "Ma boutique");
    const s = await synchroniserMaintenant(c.id);
    expect(s.erreur).toBeUndefined();
    expect(s.resultat).toMatchObject({ enregistrees: 0 });

    await deconnecterBoutique(c.id);
    const apres = (await connexionsDe(idA)).find((x) => x.id === c.id)!;
    expect(apres.archiveeLe).not.toBeNull();
    expect(apres.configChiffree).toBeNull(); // les clés du site sont effacées de la base
    expect((await synchroniserMaintenant(c.id)).erreur).toMatch(/introuvable/);
  }, 240_000);

  test("on ne peut pas dépasser 5 boutiques connectées en même temps", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    const actives = (await connexionsDe(idA)).filter((c) => !c.archiveeLe).length;
    for (let i = actives; i < 5; i++) await avecEntreprise(idA, (tx) => tx.insert(connexionBoutique).values({ entrepriseId: idA, type: "WOOCOMMERCE", nom: `Remplissage ${i}`, creeParId: adminA }));
    const r = await connecterWooCommerce(null, formulaire({ ...BON, accepte: "on" }));
    expect(r?.erreur).toMatch(/Limite de 5/);
  }, 240_000);
});

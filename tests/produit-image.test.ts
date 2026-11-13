import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, produit } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock("@/lib/i18n/langue", () => ({ getT: async () => Object.assign((texte: string, v?: Record<string, string | number>) => (v ? texte.replace(/\{(\w+)\}/g, (b, k: string) => String(v[k] ?? b)) : texte), { locale: "fr-FR" }) }));
let connecte: { utilisateurId: string; entrepriseId: string; role: string; modulesAutorises?: string[] | null } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

// Faux stockage R2 : on enregistre ce qui est envoyé et ce qui est effacé, sans rien écrire dans le vrai bucket.
const objets = new Map<string, { mime: string; taille: number }>();
let stockageEnPanne = false;
vi.mock("@/lib/documents/stockage", () => ({
  televerserDocument: async (p: { entrepriseId: string; nomFichier: string; typeMime: string; contenu: Buffer; dossier?: string }) => {
    const cle = `${p.entrepriseId}/${p.dossier ?? ""}/${p.nomFichier}`;
    if (stockageEnPanne) return { cleStockage: cle, televerse: false, erreur: "R2 en panne" };
    objets.set(cle, { mime: p.typeMime, taille: p.contenu.length });
    return { cleStockage: cle, televerse: true };
  },
  effacerObjetStockage: async (cle: string) => objets.delete(cle),
}));

const { televerserImageProduit, supprimerImageProduit, creerProduit } = await import("@/lib/actions/produit");
const { validerImageProduit, TAILLE_MAX_IMAGE_PRODUIT } = await import("@/lib/produits/image-produit");

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 2)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0, 0, 0]), Buffer.from("WEBP"), Buffer.alloc(30, 3)]);
const HTML = Buffer.from("<html><script>alert(1)</script></html>");
const fichier = (octets: Buffer, nom: string, type: string) => new File([new Uint8Array(octets)], nom, { type });
const formulaire = (valeurs: Record<string, string | File>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(valeurs)) f.set(k, v);
  return f;
};

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST ProduitImage A ${suffixe}`;
const nomB = `TEST ProduitImage B ${suffixe}`;
let idA = "", idB = "", adminA = "", employeA = "", adminB = "", produitA = "", produitB = "";

const lire = (entrepriseId: string, id: string) => avecEntreprise(entrepriseId, async (tx) => (await tx.select().from(produit).where(eq(produit.id, id)))[0]);
const nouveauProduit = (entrepriseId: string, creeParId: string, nom: string, extra: Partial<typeof produit.$inferInsert> = {}) =>
  avecEntreprise(entrepriseId, async (tx) => (await tx.insert(produit).values({ entrepriseId, creeParId, type: "BIEN", nom, ...extra }).returning({ id: produit.id }))[0].id);

beforeAll(async () => {
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
  idA = a.id;
  idB = b.id;
  const crees = await db
    .insert(utilisateur)
    .values([
      { entrepriseId: idA, email: `admin-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN", statut: "ACTIF" },
      { entrepriseId: idA, email: `employe-a-${suffixe}@vertexone.test`, nomComplet: "Employé A", role: "EMPLOYE", statut: "ACTIF" },
      { entrepriseId: idB, email: `admin-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN", statut: "ACTIF" },
    ])
    .returning({ id: utilisateur.id, email: utilisateur.email });
  adminA = crees.find((u) => u.email.startsWith("admin-a"))!.id;
  employeA = crees.find((u) => u.email.startsWith("employe-a"))!.id;
  adminB = crees.find((u) => u.email.startsWith("admin-b"))!.id;
  produitA = await nouveauProduit(idA, adminA, "Article A");
  produitB = await nouveauProduit(idB, adminB, "Article B");
}, 240_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 240_000);

beforeEach(() => {
  stockageEnPanne = false;
  connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
});

describe("Validation d'une image de produit — sur les OCTETS", () => {
  test("JPEG, PNG et WebP acceptés quel que soit le nom ou le type annoncé par le navigateur", async () => {
    for (const [octets, mime] of [[PNG, "image/png"], [JPEG, "image/jpeg"], [WEBP, "image/webp"]] as const) {
      const r = await validerImageProduit(fichier(octets, "photo.dat", "application/octet-stream"));
      expect(r.ok && r.image.mime).toBe(mime);
    }
  });

  test("une page web renommée .jpg (avec un type image/jpeg) est refusée", async () => {
    const r = await validerImageProduit(fichier(HTML, "photo.jpg", "image/jpeg"));
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.erreur).toMatch(/pas une image/);
  });

  test("aucun fichier, fichier vide ou trop lourd : refusés avec un message clair", async () => {
    expect(await validerImageProduit(null)).toMatchObject({ ok: false, erreur: "Sélectionnez une image." });
    expect(await validerImageProduit(fichier(Buffer.alloc(0), "a.png", "image/png"))).toMatchObject({ ok: false });
    const lourd = await validerImageProduit(fichier(Buffer.concat([PNG, Buffer.alloc(TAILLE_MAX_IMAGE_PRODUIT)]), "a.png", "image/png"));
    expect(lourd).toMatchObject({ ok: false });
    expect(!lourd.ok && lourd.erreur).toMatch(/4 Mo/);
  });
});

describe("Ajouter, remplacer, supprimer l'image d'un produit (fiche)", () => {
  test("ajouter : l'image est rangée sous le dossier de l'entreprise, le produit la référence, confirmation affichée", async () => {
    const r = await televerserImageProduit(produitA, null, formulaire({ image: fichier(PNG, "mon vélo (1).PNG", "image/png") }));
    expect(r).toEqual({ confirmation: "Image enregistrée." });
    const p = await lire(idA, produitA);
    expect(p.imageCleStockage!.startsWith(`${idA}/produits/produit-${produitA}-`)).toBe(true);
    expect(p.imageCleStockage).not.toContain("vélo"); // jamais le nom du fichier de l'utilisateur
    expect(p.imageTypeMime).toBe("image/png");
    expect(objets.has(p.imageCleStockage!)).toBe(true);
  }, 240_000);

  test("remplacer : le nouvel objet est posé et l'ancien est EFFACÉ de R2 (jamais d'orphelin)", async () => {
    const avant = (await lire(idA, produitA)).imageCleStockage!;
    const r = await televerserImageProduit(produitA, null, formulaire({ image: fichier(JPEG, "autre.jpg", "image/jpeg") }));
    expect(r?.confirmation).toBeTruthy();
    const apres = await lire(idA, produitA);
    expect(apres.imageCleStockage).not.toBe(avant);
    expect(apres.imageTypeMime).toBe("image/jpeg");
    expect(objets.has(avant)).toBe(false);
    expect(objets.has(apres.imageCleStockage!)).toBe(true);
  }, 240_000);

  test("un fichier qui n'est pas une image ne touche à rien : ni R2, ni le produit", async () => {
    const avant = await lire(idA, produitA);
    const nbObjets = objets.size;
    const r = await televerserImageProduit(produitA, null, formulaire({ image: fichier(HTML, "photo.jpg", "image/jpeg") }));
    expect(r?.erreur).toMatch(/pas une image/);
    expect((await lire(idA, produitA)).imageCleStockage).toBe(avant.imageCleStockage);
    expect(objets.size).toBe(nbObjets);
  }, 240_000);

  test("stockage en panne : message clair, l'image actuelle est conservée", async () => {
    const avant = (await lire(idA, produitA)).imageCleStockage;
    stockageEnPanne = true;
    const r = await televerserImageProduit(produitA, null, formulaire({ image: fichier(PNG, "x.png", "image/png") }));
    expect(r?.erreur).toMatch(/stockage des images n'est pas disponible/);
    expect((await lire(idA, produitA)).imageCleStockage).toBe(avant);
  }, 240_000);

  test("un employé sans droit de modification est refusé : rien n'est envoyé", async () => {
    connecte = { utilisateurId: employeA, entrepriseId: idA, role: "EMPLOYE", modulesAutorises: [] };
    const nbObjets = objets.size;
    const r = await televerserImageProduit(produitA, null, formulaire({ image: fichier(PNG, "x.png", "image/png") }));
    expect(r?.erreur).toMatch(/pas le droit/);
    expect((await supprimerImageProduit(produitA)).erreur).toMatch(/pas le droit/);
    expect(objets.size).toBe(nbObjets);
    expect((await lire(idA, produitA)).imageCleStockage).toBeTruthy();
  }, 240_000);

  test("supprimer : l'image disparaît du produit ET de R2 ; recommencer ne casse rien", async () => {
    const cle = (await lire(idA, produitA)).imageCleStockage!;
    expect(await supprimerImageProduit(produitA)).toEqual({});
    expect(await lire(idA, produitA)).toMatchObject({ imageCleStockage: null, imageTypeMime: null });
    expect(objets.has(cle)).toBe(false);
    expect(await supprimerImageProduit(produitA)).toEqual({});
  }, 240_000);

  test("l'image envoyée efface l'adresse d'image à charger et son motif de refus (import)", async () => {
    await avecEntreprise(idA, (tx) => tx.update(produit).set({ imageSourceUrl: "https://cdn.exemple.cm/a.png", imageSourceErreur: "refusée" }).where(eq(produit.id, produitA)));
    await televerserImageProduit(produitA, null, formulaire({ image: fichier(PNG, "x.png", "image/png") }));
    expect(await lire(idA, produitA)).toMatchObject({ imageSourceUrl: null, imageSourceErreur: null });
  }, 240_000);
});

describe("Isolation entre entreprises", () => {
  test("l'identifiant du produit d'une autre entreprise ne permet NI de poser, NI de remplacer, NI de supprimer son image — et rien ne reste dans R2", async () => {
    const nbObjets = objets.size;
    const r = await televerserImageProduit(produitB, null, formulaire({ image: fichier(PNG, "intrus.png", "image/png") }));
    expect(r?.erreur).toMatch(/introuvable/);
    expect(objets.size).toBe(nbObjets); // l'objet envoyé pour rien a été effacé
    expect((await lire(idB, produitB)).imageCleStockage).toBeNull();

    // Même quand B a vraiment une image : A ne peut pas la supprimer.
    await avecEntreprise(idB, (tx) => tx.update(produit).set({ imageCleStockage: `${idB}/produits/image-de-b.png`, imageTypeMime: "image/png" }).where(eq(produit.id, produitB)));
    objets.set(`${idB}/produits/image-de-b.png`, { mime: "image/png", taille: 10 });
    expect((await supprimerImageProduit(produitB)).erreur).toMatch(/introuvable/);
    expect((await lire(idB, produitB)).imageCleStockage).toBe(`${idB}/produits/image-de-b.png`);
    expect(objets.has(`${idB}/produits/image-de-b.png`)).toBe(true);
  }, 240_000);
});

describe("Création d'un produit avec une image", () => {
  const creer = (valeurs: Record<string, string | File>) => creerProduit(null, formulaire({ type: "SERVICE", prixVente: "1000", prixAchat: "0", ...valeurs })).then(() => null, (e: Error) => e.message);

  test("avec une image : le produit naît avec elle, rangée sous le dossier de l'entreprise", async () => {
    const issue = await creer({ nom: `Avec image ${suffixe}`, image: fichier(JPEG, "photo.jpg", "image/jpeg") });
    expect(issue).toBe("REDIRECT /app/produits");
    const [p] = await avecEntreprise(idA, (tx) => tx.select().from(produit).where(eq(produit.nom, `Avec image ${suffixe}`)));
    expect(p.imageCleStockage!.startsWith(`${idA}/produits/produit-`)).toBe(true);
    expect(p.imageTypeMime).toBe("image/jpeg");
    expect(objets.has(p.imageCleStockage!)).toBe(true);
  }, 240_000);

  test("sans image (champ vide du navigateur) : le produit se crée normalement", async () => {
    const issue = await creer({ nom: `Sans image ${suffixe}`, image: new File([], "", { type: "application/octet-stream" }) });
    expect(issue).toBe("REDIRECT /app/produits");
    const [p] = await avecEntreprise(idA, (tx) => tx.select().from(produit).where(eq(produit.nom, `Sans image ${suffixe}`)));
    expect(p.imageCleStockage).toBeNull();
  }, 240_000);

  test("image invalide : AUCUN produit n'est créé (pas de demi-création) et rien n'est envoyé", async () => {
    const nbObjets = objets.size;
    const retour = await creerProduit(null, formulaire({ type: "SERVICE", nom: `Mauvaise image ${suffixe}`, prixVente: "1000", prixAchat: "0", image: fichier(HTML, "p.jpg", "image/jpeg") }));
    expect(retour?.erreur).toMatch(/pas une image/);
    expect(await avecEntreprise(idA, (tx) => tx.select().from(produit).where(eq(produit.nom, `Mauvaise image ${suffixe}`)))).toHaveLength(0);
    expect(objets.size).toBe(nbObjets);
  }, 240_000);

  test("stockage en panne : aucun produit n'est créé (l'utilisateur ne recréera pas un doublon)", async () => {
    stockageEnPanne = true;
    const retour = await creerProduit(null, formulaire({ type: "SERVICE", nom: `Stockage panne ${suffixe}`, prixVente: "1000", prixAchat: "0", image: fichier(PNG, "p.png", "image/png") }));
    expect(retour?.erreur).toMatch(/stockage des images n'est pas disponible/);
    expect(await avecEntreprise(idA, (tx) => tx.select().from(produit).where(eq(produit.nom, `Stockage panne ${suffixe}`)))).toHaveLength(0);
  }, 240_000);
});

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, produit, depot, cleApiEntreprise, commandeSite } from "@/db/schema";
import type { UtilisateurConnecte } from "@/lib/session";
import { lireCsv } from "@/lib/import/csv";
import { DEFINITIONS, proposerCorrespondance } from "@/lib/import/definitions";
import { versTableau } from "@/lib/import/fichier";
import { appliquerCorrespondance, executerImport } from "@/lib/import/moteur";
import { enregistrerCommandeSite, resumeBoutique } from "@/lib/api-externe/stock-site";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock("@/lib/i18n/langue", () => ({ getT: async () => Object.assign((texte: string, v?: Record<string, string | number>) => (v ? texte.replace(/\{(\w+)\}/g, (b, k: string) => String(v[k] ?? b)) : texte), { locale: "fr-FR" }) }));
let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

const { connecterBoutique, definirDepotConnexion, definirAutorisationStockCle } = await import("@/lib/actions/boutique-stock");

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST BoutiqueEcran A ${suffixe}`;
const nomB = `TEST BoutiqueEcran B ${suffixe}`;
let idA = "", idB = "", adminA = "", managerA = "", adminB = "", depotA = "", depotB = "";

const formulaire = (valeurs: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(valeurs)) f.set(k, v);
  return f;
};
const clesDe = (entrepriseId: string) => avecEntreprise(entrepriseId, (tx) => tx.select().from(cleApiEntreprise).where(eq(cleApiEntreprise.entrepriseId, entrepriseId)));

beforeAll(async () => {
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
}, 180_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 180_000);

describe("Connecter une boutique — droits et dépôt", () => {
  test("l'Administrateur connecte un site en un clic : clé affichée une fois, droit « stock » accordé, jamais celui de facturer", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    const r = await connecterBoutique(null, formulaire({ nom: "Ma boutique" }));
    expect(r?.cleCree).toMatch(/^vo_/);
    expect(r?.erreur).toBeUndefined();
    const [cle] = (await clesDe(idA)).filter((c) => c.nom === "Ma boutique");
    expect(cle).toMatchObject({ autoriseStock: true, autoriseFacturation: false, depotStockId: null, revoqueeLe: null });
    expect(JSON.stringify(cle)).not.toContain(r!.cleCree!); // la clé en clair n'est jamais conservée
  });

  test("un Manager (ou un nom trop court) est refusé : rien n'est créé", async () => {
    const avant = (await clesDe(idA)).length;
    connecte = { utilisateurId: managerA, entrepriseId: idA, role: "MANAGER" };
    expect((await connecterBoutique(null, formulaire({ nom: "Boutique du manager" })))?.erreur).toMatch(/administrateur/i);
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    expect((await connecterBoutique(null, formulaire({ nom: "x" })))?.erreur).toBeTruthy();
    expect((await clesDe(idA)).length).toBe(avant);
  });

  test("le dépôt choisi est relu en base : celui d'une autre entreprise est refusé", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    expect((await connecterBoutique(null, formulaire({ nom: "Volée", depot: depotB })))?.erreur).toMatch(/dépôt/);
    expect((await clesDe(idA)).some((c) => c.nom === "Volée")).toBe(false);
    const ok = await connecterBoutique(null, formulaire({ nom: "Avec son dépôt", depot: depotA }));
    expect(ok?.cleCree).toBeTruthy();
    expect((await clesDe(idA)).find((c) => c.nom === "Avec son dépôt")?.depotStockId).toBe(depotA);
  });

  test("changer le dépôt d'une connexion : seulement un dépôt de SON entreprise, seulement sa propre connexion", async () => {
    const [cle] = (await clesDe(idA)).filter((c) => c.nom === "Ma boutique");
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    expect((await definirDepotConnexion(cle.id, depotB)).erreur).toBeTruthy();
    expect((await definirDepotConnexion(cle.id, depotA)).erreur).toBeUndefined();
    expect((await clesDe(idA)).find((c) => c.id === cle.id)?.depotStockId).toBe(depotA);
    expect((await definirDepotConnexion(cle.id, null)).erreur).toBeUndefined();
    expect((await clesDe(idA)).find((c) => c.id === cle.id)?.depotStockId).toBeNull();
    // L'Administrateur de B ne peut pas toucher à la connexion de A.
    connecte = { utilisateurId: adminB, entrepriseId: idB, role: "ADMIN" };
    expect((await definirDepotConnexion(cle.id, depotB)).erreur).toBeTruthy();
    expect((await definirAutorisationStockCle(cle.id, false)).erreur).toBeUndefined(); // sans effet, jamais d'erreur qui révèle l'existence
    expect((await clesDe(idA)).find((c) => c.id === cle.id)?.autoriseStock).toBe(true);
  });
});

describe("Écran de suivi — produits reliés, codes inconnus, activité", () => {
  const CODE = `BOU-${suffixe}`;
  let cleId = "";

  test("compteurs de produits reliés, puis un code inconnu apparaît et disparaît dès que le produit reçoit ce code", async () => {
    const [cle] = (await clesDe(idA)).filter((c) => c.nom === "Ma boutique");
    cleId = cle.id;
    await avecEntreprise(idA, (tx) =>
      tx.insert(produit).values([
        { entrepriseId: idA, creeParId: adminA, type: "BIEN", nom: "Relié", suiviStock: true, stockActuel: 5, codeBarres: `REL-${suffixe}` },
        { entrepriseId: idA, creeParId: adminA, type: "BIEN", nom: "Pas relié", suiviStock: true, stockActuel: 5 },
        { entrepriseId: idA, creeParId: adminA, type: "SERVICE", nom: "Service", suiviStock: false },
      ])
    );
    let resume = await avecEntreprise(idA, (tx) => resumeBoutique(tx, idA));
    expect(resume).toMatchObject({ produitsSuivis: 2, produitsSuivisAvecCode: 1 });

    await avecEntreprise(idA, (tx) => enregistrerCommandeSite(tx, idA, { id: cleId, nom: "Ma boutique", depotStockId: null }, { reference: `r-${suffixe}`, lignes: [{ code: CODE, quantite: 2 }, { code: `REL-${suffixe}`, quantite: 1 }] }));
    resume = await avecEntreprise(idA, (tx) => resumeBoutique(tx, idA));
    expect(resume.codesInconnus.map((c) => c.code)).toEqual([CODE]);
    expect(resume.dernieresCommandes[0]).toMatchObject({ reference: `r-${suffixe}`, nbLignes: 2, nbProblemes: 1, statut: "ENREGISTREE" });
    expect(resume.parConnexion[cleId]?.commandes).toBe(1);

    // L'Administrateur renseigne le code sur le bon produit : le signalement disparaît.
    await avecEntreprise(idA, (tx) => tx.update(produit).set({ codeBarres: CODE }).where(and(eq(produit.entrepriseId, idA), eq(produit.nom, "Pas relié"))));
    resume = await avecEntreprise(idA, (tx) => resumeBoutique(tx, idA));
    expect(resume.codesInconnus).toEqual([]);
    expect(resume.produitsSuivisAvecCode).toBe(2);
  }, 120_000);

  test("un produit dont le stock n'est pas suivi est signalé à part, et la commande n'a rien sorti pour lui", async () => {
    const [cle] = (await clesDe(idA)).filter((c) => c.nom === "Ma boutique");
    await avecEntreprise(idA, (tx) => tx.insert(produit).values({ entrepriseId: idA, creeParId: adminA, type: "BIEN", nom: "Sans suivi", suiviStock: false, codeBarres: `NSU-${suffixe}` }));
    await avecEntreprise(idA, (tx) => enregistrerCommandeSite(tx, idA, { id: cle.id, nom: "Ma boutique", depotStockId: null }, { reference: `r2-${suffixe}`, lignes: [{ code: `NSU-${suffixe}`, quantite: 3 }] }));
    const resume = await avecEntreprise(idA, (tx) => resumeBoutique(tx, idA));
    expect(resume.codesNonSuivis).toEqual([{ code: `NSU-${suffixe}`, nom: "Sans suivi", fois: 1 }]);
  }, 120_000);

  test("l'écran de B ne montre rien de l'activité de A (RLS)", async () => {
    const resume = await avecEntreprise(idB, (tx) => resumeBoutique(tx, idB));
    expect(resume).toMatchObject({ produitsSuivis: 0, produitsSuivisAvecCode: 0, codesInconnus: [], codesNonSuivis: [], dernieresCommandes: [], parConnexion: {} });
    expect(await avecEntreprise(idB, (tx) => tx.select().from(commandeSite))).toHaveLength(0);
  }, 120_000);
});

describe("Import de produits — colonne Code-barres", () => {
  async function importer(user: UtilisateurConnecte, csv: string) {
    const tableau = versTableau(lireCsv(csv));
    if (!tableau.ok) throw new Error(tableau.erreur);
    const correspondance = proposerCorrespondance(tableau.entetes, DEFINITIONS.PRODUITS.champs);
    const lignes = appliquerCorrespondance(tableau.lignes, correspondance);
    return avecEntreprise(user.entrepriseId, (tx) => executerImport(tx, user, "PRODUITS", lignes, {}));
  }
  const utilisateurA = () => ({ utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" }) as unknown as UtilisateurConnecte;

  test("la colonne « SKU » / « Code produit » est reconnue et enregistrée comme code-barres ; un code déjà pris est écarté sans bloquer", async () => {
    const csv = `Nom,SKU,Prix,Stock\nAlpha,IMP-${suffixe}-1,1000,4\nBeta,IMP-${suffixe}-2,2000,6\nGamma,imp-${suffixe}-1,3000,8\nDelta,,4000,1`;
    const rapport = await importer(utilisateurA(), csv);
    expect(rapport.crees).toBe(4);
    const produits = await avecEntreprise(idA, (tx) => tx.select().from(produit));
    expect(produits.find((p) => p.nom === "Alpha")?.codeBarres).toBe(`IMP-${suffixe}-1`);
    expect(produits.find((p) => p.nom === "Beta")?.codeBarres).toBe(`IMP-${suffixe}-2`);
    expect(produits.find((p) => p.nom === "Gamma")?.codeBarres).toBeNull(); // même code que Alpha (casse près) : écarté, avertissement
    expect(produits.find((p) => p.nom === "Delta")?.codeBarres).toBeNull();
    expect(rapport.avertissements.some((a) => /code-barres/.test(a.message))).toBe(true);
  }, 120_000);

  test("rejouer le fichier ne crée rien et ne casse pas sur le code déjà présent", async () => {
    const csv = `Nom,SKU,Prix,Stock\nAlpha,IMP-${suffixe}-1,1000,4`;
    const rapport = await importer(utilisateurA(), csv);
    expect(rapport.crees).toBe(0);
    expect(rapport.ignores).toBe(1);
  }, 120_000);

  test("un produit déjà présent sous le même nom mais SANS code reçoit le code du fichier ; un produit qui a déjà un code n'est jamais modifié, ni un code déjà pris attribué deux fois", async () => {
    await avecEntreprise(idA, (tx) =>
      tx.insert(produit).values([
        { entrepriseId: idA, creeParId: adminA, type: "BIEN", nom: `Sans code ${suffixe}`, prixVente: 111 },
        { entrepriseId: idA, creeParId: adminA, type: "BIEN", nom: `Avec code ${suffixe}`, prixVente: 222, codeBarres: `GARDE-${suffixe}` },
        { entrepriseId: idA, creeParId: adminA, type: "BIEN", nom: `Autre sans code ${suffixe}`, prixVente: 333 },
      ])
    );
    const csv = `Nom,SKU,Prix de vente
Sans code ${suffixe},FILL-${suffixe},9999
Avec code ${suffixe},ECRASE-${suffixe},9999
Autre sans code ${suffixe},FILL-${suffixe},9999`;
    const rapport = await importer(utilisateurA(), csv);
    expect(rapport.crees).toBe(0);
    expect(rapport.ignores).toBe(3);
    const lus = await avecEntreprise(idA, (tx) => tx.select().from(produit));
    const par = (nom: string) => lus.find((p) => p.nom === `${nom} ${suffixe}`)!;
    expect(par("Sans code")).toMatchObject({ codeBarres: `FILL-${suffixe}`, prixVente: 111 }); // seul le code est rempli, jamais le prix
    expect(par("Avec code").codeBarres).toBe(`GARDE-${suffixe}`); // jamais écrasé
    expect(par("Autre sans code").codeBarres).toBeNull(); // le même code ne va pas à deux produits
    expect(rapport.resume.some((r) => /ont reçu leur code-barres/.test(r.libelle) && r.nombre === 1)).toBe(true);
  }, 120_000);
});

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, produit, connexionBoutique, commandeSite } from "@/db/schema";
import type { UtilisateurConnecte } from "@/lib/session";
import { lireCsv } from "@/lib/import/csv";
import { DEFINITIONS, proposerCorrespondance } from "@/lib/import/definitions";
import { versTableau } from "@/lib/import/fichier";
import { appliquerCorrespondance, executerImport, SimulationTerminee, type Rapport } from "@/lib/import/moteur";
import { refusImport } from "@/lib/import/droits";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

const { GET: EXPORT_STOCK } = await import("@/app/app/produits/export-stock-site/route");

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST BoutiqueFichiers A ${suffixe}`;
const nomB = `TEST BoutiqueFichiers B ${suffixe}`;
const F1 = `F1-${suffixe}`;
const F2 = `F2-${suffixe}`;
let idA = "", idB = "", adminA = "", managerA = "", adminB = "", p1 = "", p2 = "", pB = "";

const comme = (entrepriseId: string, utilisateurId: string, role: "ADMIN" | "MANAGER") => ({ utilisateurId, entrepriseId, role }) as unknown as UtilisateurConnecte;
const stockDe = (entrepriseId: string, id: string) => avecEntreprise(entrepriseId, async (tx) => (await tx.select({ s: produit.stockActuel }).from(produit).where(eq(produit.id, id)))[0].s);
const nouveauProduit = (entrepriseId: string, creeParId: string, v: Partial<typeof produit.$inferInsert>) =>
  avecEntreprise(entrepriseId, async (tx) => (await tx.insert(produit).values({ entrepriseId, creeParId, type: "BIEN", nom: "Article", suiviStock: true, ...v }).returning({ id: produit.id }))[0].id);

async function lancer(user: UtilisateurConnecte, csv: string, simulation = false): Promise<Rapport> {
  const tableau = versTableau(lireCsv(csv));
  if (!tableau.ok) throw new Error(tableau.erreur);
  const correspondance = proposerCorrespondance(tableau.entetes, DEFINITIONS.COMMANDES_SITE.champs);
  const lignes = appliquerCorrespondance(tableau.lignes, correspondance);
  try {
    return await avecEntreprise(user.entrepriseId, async (tx) => {
      const rapport = await executerImport(tx, user, "COMMANDES_SITE", lignes, {});
      if (simulation) throw new SimulationTerminee(rapport);
      return rapport;
    });
  } catch (e) {
    if (e instanceof SimulationTerminee) return e.rapport;
    throw e;
  }
}

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
  p1 = await nouveauProduit(idA, adminA, { nom: "Article 1", codeBarres: F1, stockActuel: 20 });
  p2 = await nouveauProduit(idA, adminA, { nom: "Article 2", codeBarres: F2, stockActuel: 8 });
  await nouveauProduit(idA, adminA, { nom: "Sans code", stockActuel: 5 });
  await nouveauProduit(idA, adminA, { nom: "Non suivi", suiviStock: false, codeBarres: `NS-${suffixe}` });
  pB = await nouveauProduit(idB, adminB, { nom: "Article de B", codeBarres: F1, stockActuel: 500 }); // même code chez B
}, 240_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 240_000);

describe("Échange de fichiers — commandes du site", () => {
  const csv = (n: string) => `Name,Email,Lineitem sku,Lineitem quantity\n#${n}1,a@b.cm,${F1},3\n#${n}1,a@b.cm,${F2},1\n#${n}2,c@d.cm,${F1},2\n#${n}2,c@d.cm,INCONNU-${suffixe},1`;

  test("les colonnes d'un export de type Shopify sont reconnues toutes seules", () => {
    const tableau = versTableau(lireCsv(csv("A")));
    if (!tableau.ok) throw new Error(tableau.erreur);
    expect(proposerCorrespondance(tableau.entetes, DEFINITIONS.COMMANDES_SITE.champs)).toMatchObject({ reference: "Name", code: "Lineitem sku", quantite: "Lineitem quantity" });
    for (const entetes of ["Numéro de commande,Code,Quantité", "order number,sku,qty", "N commande;Code produit;Quantite"]) {
      const t = versTableau(lireCsv(`${entetes}\n1,X,1`));
      if (!t.ok) throw new Error(t.erreur);
      const c = proposerCorrespondance(t.entetes, DEFINITIONS.COMMANDES_SITE.champs);
      expect(Object.keys(c).sort(), entetes).toEqual(["code", "quantite", "reference"]);
    }
  });

  test("la simulation montre ce qui va se passer mais ne change rien (stock, connexion, commandes)", async () => {
    const r = await lancer(comme(idA, adminA, "ADMIN"), csv("S"), true);
    expect(r.crees).toBe(2);
    expect(await stockDe(idA, p1)).toBe(20);
    expect(await avecEntreprise(idA, (tx) => tx.select().from(commandeSite))).toHaveLength(0);
    expect(await avecEntreprise(idA, (tx) => tx.select().from(connexionBoutique))).toHaveLength(0);
  }, 240_000);

  test("l'import réel regroupe les lignes par commande, fait baisser le stock et signale le code inconnu", async () => {
    const r = await lancer(comme(idA, adminA, "ADMIN"), csv("A"));
    expect(r).toMatchObject({ crees: 2, ignores: 0, nbErreurs: 0 });
    expect(await stockDe(idA, p1)).toBe(15); // 3 + 2
    expect(await stockDe(idA, p2)).toBe(7);
    expect(r.avertissements.map((a) => a.message).join(" ")).toMatch(/pas été reconnus/);
    const commandes = await avecEntreprise(idA, (tx) => tx.select().from(commandeSite));
    expect(commandes).toHaveLength(2);
    expect(commandes.every((c) => c.connexionId && !c.cleId && c.source === "Échange de fichiers")).toBe(true);
    const connexions = await avecEntreprise(idA, (tx) => tx.select().from(connexionBoutique));
    expect(connexions).toHaveLength(1);
    expect(connexions[0]).toMatchObject({ type: "FICHIER", configChiffree: null });
  }, 240_000);

  test("réimporter le même fichier (ou un export qui en contient une partie) ne fait JAMAIS baisser le stock deux fois", async () => {
    const r = await lancer(comme(idA, adminA, "ADMIN"), csv("A"));
    expect(r).toMatchObject({ crees: 0, ignores: 2 });
    expect(await stockDe(idA, p1)).toBe(15);
    const plus = await lancer(comme(idA, adminA, "ADMIN"), `${csv("A")}\n#A3,e@f.cm,${F2},2`);
    expect(plus).toMatchObject({ crees: 1, ignores: 2 });
    expect(await stockDe(idA, p2)).toBe(5);
    expect(await avecEntreprise(idA, (tx) => tx.select().from(connexionBoutique))).toHaveLength(1); // toujours une seule connexion « fichier »
  }, 240_000);

  test("les lignes invalides sont signalées une à une sans empêcher les autres", async () => {
    const r = await lancer(comme(idA, adminA, "ADMIN"), `Numéro de commande,Code,Quantité\n#B1,${F1},1\n,${F1},1\n#B3,,1\n#B4,${F1},0\n#B5,${F1},abc\n#B6,${F2},1`);
    expect(r.crees).toBe(2);
    expect(r.nbErreurs).toBe(4);
    expect(r.erreurs.map((e) => e.ligne)).toEqual([3, 4, 5, 6]);
    expect(await stockDe(idA, p1)).toBe(14);
  }, 240_000);

  test("un produit non suivi ou sans code ne bloque rien : signalé, aucun stock ne bouge", async () => {
    const avant = await stockDe(idA, p1);
    const r = await lancer(comme(idA, adminA, "ADMIN"), `Numéro de commande,Code,Quantité\n#C1,NS-${suffixe},4`);
    expect(r.crees).toBe(1);
    expect(r.avertissements.map((a) => a.message).join(" ")).toMatch(/n'est pas suivi/);
    expect(await stockDe(idA, p1)).toBe(avant);
  }, 240_000);

  test("l'autre entreprise (même code F1) n'est jamais touchée et ne voit rien", async () => {
    expect(await stockDe(idB, pB)).toBe(500);
    expect(await avecEntreprise(idB, (tx) => tx.select().from(commandeSite))).toHaveLength(0);
    expect(await avecEntreprise(idB, (tx) => tx.select().from(connexionBoutique))).toHaveLength(0);
  }, 120_000);

  test("seul l'Administrateur peut importer des commandes (un Manager est refusé)", () => {
    const manager = { utilisateurId: managerA, entrepriseId: idA, role: "MANAGER", modulesAutorises: null } as unknown as UtilisateurConnecte;
    expect(refusImport(manager, "COMMANDES_SITE")).toMatch(/Administrateur/);
    expect(refusImport({ ...manager, role: "ADMIN" } as UtilisateurConnecte, "COMMANDES_SITE")).toBeNull();
  });
});

describe("Échange de fichiers — télécharger le stock", () => {
  test("sans session : 401 ; Manager : 403 ; aucune donnée ne sort", async () => {
    connecte = null;
    expect((await EXPORT_STOCK()).status).toBe(401);
    connecte = { utilisateurId: managerA, entrepriseId: idA, role: "MANAGER" };
    expect((await EXPORT_STOCK()).status).toBe(403);
  }, 120_000);

  test("l'Administrateur obtient un CSV « SKU, Stock » de SES produits suivis qui ont un code, au stock disponible", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    const r = await EXPORT_STOCK();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/text\/csv/);
    expect(r.headers.get("content-disposition")).toMatch(/attachment; filename="vertexone-stock-pour-mon-site-\d{4}-\d{2}-\d{2}\.csv"/);
    const lignes = (await r.text()).trim().split(/\r?\n/);
    expect(lignes[0]).toBe("SKU,Stock"); // virgule et sans BOM : c'est ce qu'attendent les importeurs des boutiques
    const stock = new Map(lignes.slice(1).map((l) => l.split(",") as [string, string]));
    expect(stock.get(F1)).toBe(String(await stockDe(idA, p1)));
    expect(stock.get(F2)).toBe(String(await stockDe(idA, p2)));
    expect(stock.has(`NS-${suffixe}`)).toBe(false); // non suivi
    expect(lignes.join("\n")).not.toContain("500"); // le stock de B n'apparaît jamais
    expect(lignes.length).toBe(3); // l'en-tête + F1 + F2 (pas l'article sans code)
  }, 120_000);
});

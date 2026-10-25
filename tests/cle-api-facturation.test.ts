import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, cleApiEntreprise } from "@/db/schema";
import { genererCle } from "@/lib/api-externe/cle";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock("@/lib/i18n/langue", () => ({ getT: async () => Object.assign((texte: string, v?: Record<string, string | number>) => (v ? texte.replace(/\{(\w+)\}/g, (b, k: string) => String(v[k] ?? b)) : texte), { locale: "fr-FR" }) }));
let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

const { creerCleApi, definirAutorisationFacturationCle } = await import("@/lib/actions/cle-api");

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST CleFacturation A ${suffixe}`;
const nomB = `TEST CleFacturation B ${suffixe}`;
let idA = "", idB = "", adminA = "", managerA = "", adminB = "", cleB = "";

const lireCle = (entrepriseId: string, id: string) => avecEntreprise(entrepriseId, async (tx) => (await tx.select().from(cleApiEntreprise).where(eq(cleApiEntreprise.id, id)))[0]);
const clesDe = (entrepriseId: string) => avecEntreprise(entrepriseId, (tx) => tx.select().from(cleApiEntreprise).where(eq(cleApiEntreprise.entrepriseId, entrepriseId)));
const formulaire = (valeurs: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(valeurs)) f.set(k, v);
  return f;
};

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
  const { prefixe, empreinte } = genererCle();
  const [cB] = await avecEntreprise(idB, (tx) => tx.insert(cleApiEntreprise).values({ entrepriseId: idB, nom: "Site B", prefixe, empreinte, creeParId: adminB }).returning({ id: cleApiEntreprise.id }));
  cleB = cB.id;
}, 180_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 180_000);

describe("Clés d'API — autorisation de facturer", () => {
  test("une clé créée sans la case cochée ne peut pas facturer ; avec la case, oui", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    expect((await creerCleApi(null, formulaire({ nom: "Site sans droit" })))?.cleCree).toBeTruthy();
    expect((await creerCleApi(null, formulaire({ nom: "Site facturant", facturation: "on" })))?.cleCree).toBeTruthy();
    const cles = await clesDe(idA);
    expect(cles.find((c) => c.nom === "Site sans droit")?.autoriseFacturation).toBe(false);
    expect(cles.find((c) => c.nom === "Site facturant")?.autoriseFacturation).toBe(true);
  }, 240_000);

  test("l'Administrateur accorde puis retire le droit ; un Manager ne peut pas ; sans session, redirection", async () => {
    const cle = (await clesDe(idA)).find((c) => c.nom === "Site sans droit")!;
    connecte = { utilisateurId: managerA, entrepriseId: idA, role: "MANAGER" };
    expect(await definirAutorisationFacturationCle(cle.id, true)).toHaveProperty("erreur");
    expect((await lireCle(idA, cle.id)).autoriseFacturation).toBe(false);

    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    expect(await definirAutorisationFacturationCle(cle.id, true)).toEqual({});
    expect((await lireCle(idA, cle.id)).autoriseFacturation).toBe(true);
    expect(await definirAutorisationFacturationCle(cle.id, false)).toEqual({});
    expect((await lireCle(idA, cle.id)).autoriseFacturation).toBe(false);

    connecte = null;
    await expect(definirAutorisationFacturationCle(cle.id, true)).rejects.toThrow("REDIRECT /connexion");
  }, 240_000);

  test("on ne peut jamais modifier la clé d'une autre entreprise", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    await definirAutorisationFacturationCle(cleB, true);
    expect((await lireCle(idB, cleB)).autoriseFacturation).toBe(false);
  }, 240_000);

  test("une clé révoquée n'est jamais modifiée", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    const { prefixe, empreinte } = genererCle();
    const [c] = await avecEntreprise(idA, (tx) => tx.insert(cleApiEntreprise).values({ entrepriseId: idA, nom: "Ancienne", prefixe, empreinte, creeParId: adminA, revoqueeLe: new Date() }).returning({ id: cleApiEntreprise.id }));
    await definirAutorisationFacturationCle(c.id, true);
    expect((await lireCle(idA, c.id)).autoriseFacturation).toBe(false);
  }, 240_000);
});

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entreprise, utilisateur, session, compte } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock("@/lib/i18n/langue", () => ({ getT: async () => (texte: string) => texte }));

let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

/**
 * Suppression d'un compte par l'Administrateur : retrait de l'accès sans perdre l'historique, et jamais au-delà de son
 * entreprise ni vers un autre Administrateur. `utilisateur` étant en RLS permissive, seul le filtre explicite protège.
 */
const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Suppression A ${suffixe}`;
const nomB = `TEST Suppression B ${suffixe}`;
let a = "", b = "", adminA = "", adminA2 = "", managerA = "", employeA = "", clientA = "", adminB = "", employeB = "";

beforeAll(async () => {
  [{ id: a }] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "generique" }).returning({ id: entreprise.id });
  [{ id: b }] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "generique" }).returning({ id: entreprise.id });
  const creer = async (entrepriseId: string, prefixe: string, role: "ADMIN" | "MANAGER" | "EMPLOYE" | "CLIENT", managerId?: string) =>
    (await db.insert(utilisateur).values({ entrepriseId, email: `${prefixe}-${suffixe}@vertexone.test`, nomComplet: prefixe, role, managerId }).returning({ id: utilisateur.id }))[0].id;
  adminA = await creer(a, "admin-a", "ADMIN");
  adminA2 = await creer(a, "admin-a2", "ADMIN");
  managerA = await creer(a, "manager-a", "MANAGER");
  employeA = await creer(a, "employe-a", "EMPLOYE", managerA);
  clientA = await creer(a, "client-a", "CLIENT");
  adminB = await creer(b, "admin-b", "ADMIN");
  employeB = await creer(b, "employe-b", "EMPLOYE");
  await db.insert(session).values({ token: `tok-${suffixe}`, userId: managerA, expiresAt: new Date(Date.now() + 3600_000) });
  await db.insert(compte).values({ accountId: managerA, providerId: "credential", issuer: "test", userId: managerA, password: "hash" });
}, 120_000);

afterAll(async () => {
  await db.delete(session).where(eq(session.userId, managerA));
  await db.delete(compte).where(eq(compte.userId, managerA));
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 120_000);

const lire = async (id: string) => (await db.select().from(utilisateur).where(eq(utilisateur.id, id)))[0];

describe("Suppression d'un compte par l'Administrateur", () => {
  test("un Manager ne peut pas supprimer", async () => {
    connecte = { utilisateurId: managerA, entrepriseId: a, role: "MANAGER" };
    const { supprimerCompte } = await import("@/lib/actions/suppression-compte");
    expect((await supprimerCompte(employeA))?.erreur).toMatch(/Administrateur/);
    expect((await lire(employeA)).statut).toBe("ACTIF");
  });

  test("l'Administrateur ne peut supprimer ni lui-même, ni un autre Administrateur", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const { supprimerCompte } = await import("@/lib/actions/suppression-compte");
    expect((await supprimerCompte(adminA))?.erreur).toBeTruthy();
    expect((await supprimerCompte(adminA2))?.erreur).toBeTruthy();
    expect((await lire(adminA2)).statut).toBe("ACTIF");
  });

  test("jamais un compte d'une autre entreprise", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const { supprimerCompte } = await import("@/lib/actions/suppression-compte");
    expect((await supprimerCompte(employeB))?.erreur).toBeTruthy();
    const intact = await lire(employeB);
    expect(intact.statut).toBe("ACTIF");
    expect(intact.email).toBe(`employe-b-${suffixe}@vertexone.test`);
  });

  test("supprime un Manager : accès coupé, adresse libérée, équipe sans manager, historique conservé", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const { supprimerCompte } = await import("@/lib/actions/suppression-compte");
    expect(await supprimerCompte(managerA)).toBeNull();
    const m = await lire(managerA);
    expect(m.statut).toBe("SUPPRIME");
    expect(m.nomComplet).toBe("manager-a"); // la ligne reste : l'historique garde son auteur
    expect(m.email).not.toContain("manager-a-");
    expect(await db.select().from(session).where(eq(session.userId, managerA))).toHaveLength(0);
    expect(await db.select().from(compte).where(eq(compte.userId, managerA))).toHaveLength(0);
    expect((await lire(employeA)).managerId).toBeNull();
    // une deuxième suppression n'a plus de cible
    expect((await supprimerCompte(managerA))?.erreur).toBeTruthy();
  });

  test("supprime un client du portail", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const { supprimerCompte } = await import("@/lib/actions/suppression-compte");
    expect(await supprimerCompte(clientA)).toBeNull();
    expect((await lire(clientA)).statut).toBe("SUPPRIME");
  });
});

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, session, compte, invitation } from "@/db/schema";
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

describe("Activation et désactivation d'un compte par l'Administrateur", () => {
  test("un Employé ne peut pas désactiver", async () => {
    connecte = { utilisateurId: employeA, entrepriseId: a, role: "EMPLOYE" };
    const { definirActivationCompte } = await import("@/lib/actions/suppression-compte");
    expect((await definirActivationCompte(employeA, false))?.erreur).toBeTruthy();
    expect((await lire(employeA)).statut).toBe("ACTIF");
  });

  test("ni soi-même, ni un Administrateur, ni un compte d'une autre entreprise", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const { definirActivationCompte } = await import("@/lib/actions/suppression-compte");
    expect((await definirActivationCompte(adminA, false))?.erreur).toBeTruthy();
    expect((await definirActivationCompte(adminA2, false))?.erreur).toBeTruthy();
    expect((await definirActivationCompte(employeB, false))?.erreur).toBeTruthy();
    expect((await lire(adminA2)).statut).toBe("ACTIF");
    expect((await lire(employeB)).statut).toBe("ACTIF");
  });

  test("désactive (sessions fermées) puis réactive un Employé ; un compte supprimé ne se réactive pas", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const { definirActivationCompte } = await import("@/lib/actions/suppression-compte");
    await db.insert(session).values({ token: `tok-emp-${suffixe}`, userId: employeA, expiresAt: new Date(Date.now() + 3600_000) });
    expect(await definirActivationCompte(employeA, false)).toBeNull();
    expect((await lire(employeA)).statut).toBe("DESACTIVE");
    expect(await db.select().from(session).where(eq(session.userId, employeA))).toHaveLength(0);
    expect(await definirActivationCompte(employeA, true)).toBeNull();
    expect((await lire(employeA)).statut).toBe("ACTIF");
    // managerA a été supprimé plus haut : introuvable pour l'activation
    expect((await definirActivationCompte(managerA, true))?.erreur).toBeTruthy();
    expect((await lire(managerA)).statut).toBe("SUPPRIME");
  });
});

describe("Invitations d'un compte retiré", () => {
  const inv = async (entrepriseId: string, email: string, jeton: string, utiliseeLe?: Date) =>
    (await avecEntreprise(entrepriseId, (tx) => tx.insert(invitation).values({ entrepriseId, email, roleProposee: "EMPLOYE", jeton: `${jeton}-${suffixe}`, expireLe: new Date(Date.now() + 86_400_000), utiliseeLe }).returning({ id: invitation.id })))[0].id;
  const existe = async (id: string) => (await db.select({ id: invitation.id }).from(invitation).where(eq(invitation.id, id))).length === 1; // lecture permissive hors session

  test("l'Administrateur annule une invitation en attente ; jamais celle d'une autre entreprise ni une invitation déjà utilisée", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const { annulerInvitation } = await import("@/lib/actions/invitation");
    const enAttente = await inv(a, `attente-${suffixe}@vertexone.test`, "att");
    const autreEntreprise = await inv(b, `autre-${suffixe}@vertexone.test`, "autre");
    const utilisee = await inv(a, `utilisee-${suffixe}@vertexone.test`, "util", new Date());
    expect(await annulerInvitation(autreEntreprise)).toMatchObject({ erreur: expect.any(String) });
    expect(await annulerInvitation(utilisee)).toMatchObject({ erreur: expect.any(String) });
    expect(await existe(autreEntreprise) && await existe(utilisee)).toBe(true);
    expect(await annulerInvitation(enAttente)).toBeNull();
    expect(await existe(enAttente)).toBe(false);
  });

  test("un Employé ne peut pas annuler une invitation", async () => {
    const { annulerInvitation } = await import("@/lib/actions/invitation");
    const id = await inv(a, `emp-${suffixe}@vertexone.test`, "emp");
    connecte = { utilisateurId: employeA, entrepriseId: a, role: "EMPLOYE" };
    expect((await annulerInvitation(id))?.erreur).toBeTruthy();
    expect(await existe(id)).toBe(true);
  });

  test("supprimer un compte annule ses invitations restées sans suite", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const { supprimerCompte } = await import("@/lib/actions/suppression-compte");
    const [{ id: z }] = await db.insert(utilisateur).values({ entrepriseId: a, email: `zed-${suffixe}@vertexone.test`, nomComplet: "Zed", role: "EMPLOYE" }).returning({ id: utilisateur.id });
    const relance = await inv(a, `zed-${suffixe}@vertexone.test`, "zed");
    expect(await supprimerCompte(z)).toBeNull();
    expect(await existe(relance)).toBe(false);
  });
});

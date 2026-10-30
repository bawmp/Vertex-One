import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { db } from "@/db/client";
import { entreprise, utilisateur } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

// « server-only » interdit l'import hors d'un composant serveur : sans effet pour un test Node.
vi.mock("server-only", () => ({}));

const { compterUtilisateursActifs } = await import("@/lib/abonnement/utilisateurs");
const { tarifPour, montantEtMois } = await import("@/lib/abonnement/tarif");

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Palier A ${suffixe}`;
const nomB = `TEST Palier B ${suffixe}`;
let idA: string;
let idB: string;

function lignes(entrepriseId: string, prefixe: string, n: number, extra: Partial<typeof utilisateur.$inferInsert>) {
  return Array.from({ length: n }, (_, i) => ({
    entrepriseId,
    email: `${prefixe}-${i}-${suffixe}@vertexone.test`,
    nomComplet: `${prefixe} ${i}`,
    ...extra,
  }));
}

beforeAll(async () => {
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
  idA = a.id;
  idB = b.id;
  // Entreprise A : 45 actifs (admin, managers, employés) + des comptes qui ne comptent pas.
  await db.insert(utilisateur).values([
    ...lignes(idA, "admin", 1, { role: "ADMIN", statut: "ACTIF" }),
    ...lignes(idA, "manager", 4, { role: "MANAGER", statut: "ACTIF" }),
    ...lignes(idA, "employe", 40, { role: "EMPLOYE", statut: "ACTIF" }),
    ...lignes(idA, "invite", 10, { role: "EMPLOYE", statut: "INVITE" }),
    ...lignes(idA, "desactive", 5, { role: "EMPLOYE", statut: "DESACTIVE" }),
    ...lignes(idA, "supprime", 3, { role: "EMPLOYE", statut: "SUPPRIME" }),
    ...lignes(idA, "clientportail", 20, { role: "CLIENT", statut: "ACTIF" }),
  ]);
  // Entreprise B : 60 actifs, qui ne doivent jamais se mélanger à A.
  await db.insert(utilisateur).values(lignes(idB, "equipeb", 60, { role: "EMPLOYE", statut: "ACTIF" }));
}, 300_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 300_000);

describe("Palier équipe — comptage des utilisateurs actifs", () => {
  test("ne compte que les membres ACTIFS de l'entreprise : ni invités, ni désactivés, ni supprimés, ni clients du portail, ni une autre entreprise", async () => {
    expect(await compterUtilisateursActifs(db, idA)).toBe(45);
    expect(await compterUtilisateursActifs(db, idB)).toBe(60);
  }, 120_000);

  test("49 actifs : tarif de base ; le 50e membre actif fait passer l'entreprise à 45 000 FCFA/mois pour toute l'équipe", async () => {
    const creee = new Date("2026-12-01T08:00:00Z");
    const maintenant = new Date("2027-01-15T08:00:00Z");
    expect(tarifPour(creee, maintenant, await compterUtilisateursActifs(db, idA)).prixMensuel).toBe(25_000);

    await db.insert(utilisateur).values(lignes(idA, "quatre", 4, { role: "EMPLOYE", statut: "ACTIF" })); // 45 + 4 = 49
    const a49 = await compterUtilisateursActifs(db, idA);
    expect(a49).toBe(49);
    expect(tarifPour(creee, maintenant, a49).palierEquipe).toBe(false);

    await db.insert(utilisateur).values(lignes(idA, "cinquantieme", 1, { role: "EMPLOYE", statut: "ACTIF" }));
    const a50 = await compterUtilisateursActifs(db, idA);
    expect(a50).toBe(50);
    const tarif = tarifPour(creee, maintenant, a50);
    expect(tarif).toMatchObject({ prixMensuel: 45_000, palierEquipe: true });
    expect(montantEtMois(tarif, "annuel")).toMatchObject({ montant: 450_000, mois: 12 });
    // Une autre entreprise de 60 actifs paie aussi 45 000 : un prix fixe d'équipe, pas un prix par utilisateur.
    expect(tarifPour(creee, maintenant, await compterUtilisateursActifs(db, idB)).prixMensuel).toBe(45_000);
  }, 120_000);
});

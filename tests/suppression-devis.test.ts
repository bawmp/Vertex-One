import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, devis, ligneDevis, lienClientDocument } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock("@/lib/i18n/langue", () => ({ getT: async () => (texte: string) => texte }));

let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

/**
 * Suppression d'un devis EN BROUILLON : seulement un brouillon (jamais un devis envoyé, accepté, refusé ou expiré), dans la
 * portée de l'utilisateur et de son entreprise ; ses lignes et son lien partent avec lui. Une facture ne se supprime jamais.
 */
const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST SupprDevis A ${suffixe}`;
const nomB = `TEST SupprDevis B ${suffixe}`;
let a = "", b = "", adminA = "", employeA = "", employeA2 = "", adminB = "", contactA = "", contactB = "";

async function creer(entrepriseId: string, adminId: string, contactId: string, assigneId: string, numero: string, statut: "BROUILLON" | "ENVOYE" | "ACCEPTE") {
  const [d] = await avecEntreprise(entrepriseId, (tx) =>
    tx.insert(devis).values({ entrepriseId, numero, contactId, assigneAId: assigneId, creeParId: adminId, statut, dateValidite: new Date(Date.now() + 864e5), montantHT: 1000, montantTVA: 0, montantTTC: 1000 }).returning({ id: devis.id })
  );
  await avecEntreprise(entrepriseId, (tx) => tx.insert(ligneDevis).values({ entrepriseId, devisId: d.id, designation: "Ligne", quantite: 1, prixUnitaire: 1000, tauxTVA: 0 }));
  return d.id;
}
const existe = async (entrepriseId: string, id: string) => (await avecEntreprise(entrepriseId, (tx) => tx.select({ id: devis.id }).from(devis).where(eq(devis.id, id)))).length === 1;
const nbLignes = async (entrepriseId: string, id: string) => (await avecEntreprise(entrepriseId, (tx) => tx.select({ id: ligneDevis.id }).from(ligneDevis).where(eq(ligneDevis.devisId, id)))).length;

beforeAll(async () => {
  [{ id: a }] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "generique" }).returning({ id: entreprise.id });
  [{ id: b }] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "generique" }).returning({ id: entreprise.id });
  const u = async (entrepriseId: string, prefixe: string, role: "ADMIN" | "EMPLOYE") =>
    (await db.insert(utilisateur).values({ entrepriseId, email: `${prefixe}-${suffixe}@vertexone.test`, nomComplet: prefixe, role }).returning({ id: utilisateur.id }))[0].id;
  adminA = await u(a, "admin-a", "ADMIN");
  employeA = await u(a, "employe-a", "EMPLOYE");
  employeA2 = await u(a, "employe-a2", "EMPLOYE");
  adminB = await u(b, "admin-b", "ADMIN");
  contactA = (await avecEntreprise(a, (tx) => tx.insert(contact).values({ entrepriseId: a, nom: "Client A", telephone: "690000000", assigneAId: adminA }).returning({ id: contact.id })))[0].id;
  contactB = (await avecEntreprise(b, (tx) => tx.insert(contact).values({ entrepriseId: b, nom: "Client B", telephone: "690000001", assigneAId: adminB }).returning({ id: contact.id })))[0].id;
}, 120_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 120_000);

describe("Suppression d'un devis en brouillon", () => {
  test("un brouillon se supprime, avec ses lignes et son lien ; un devis envoyé ou accepté, jamais", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const { supprimerDevis } = await import("@/lib/actions/devis");
    const brouillon = await creer(a, adminA, contactA, adminA, "DEV-T-000001", "BROUILLON");
    const envoye = await creer(a, adminA, contactA, adminA, "DEV-T-000002", "ENVOYE");
    const accepte = await creer(a, adminA, contactA, adminA, "DEV-T-000003", "ACCEPTE");
    await avecEntreprise(a, (tx) => tx.insert(lienClientDocument).values({ entrepriseId: a, devisId: brouillon, jeton: `jeton-${suffixe}-${"x".repeat(15)}` }));

    expect(await supprimerDevis(brouillon)).toBeNull();
    expect(await existe(a, brouillon)).toBe(false);
    expect(await nbLignes(a, brouillon)).toBe(0);

    for (const id of [envoye, accepte]) {
      expect((await supprimerDevis(id))?.erreur, id).toMatch(/brouillon/);
      expect(await existe(a, id)).toBe(true);
      expect(await nbLignes(a, id)).toBe(1);
    }
  }, 180_000);

  test("jamais le devis d'une autre entreprise", async () => {
    const { supprimerDevis } = await import("@/lib/actions/devis");
    const deB = await creer(b, adminB, contactB, adminB, "DEV-T-000001", "BROUILLON");
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    expect((await supprimerDevis(deB))?.erreur).toBeTruthy();
    expect(await existe(b, deB)).toBe(true);
  }, 120_000);

  test("un Employé ne supprime que les brouillons de sa portée ; un Lecteur sans droit de modifier, rien", async () => {
    const { supprimerDevis } = await import("@/lib/actions/devis");
    const aLui = await creer(a, adminA, contactA, employeA, "DEV-T-000010", "BROUILLON");
    const aUnAutre = await creer(a, adminA, contactA, employeA2, "DEV-T-000011", "BROUILLON");
    connecte = { utilisateurId: employeA, entrepriseId: a, role: "EMPLOYE" };
    // L'Employé n'a pas le droit de modifier la facturation (VOIR + CREER seulement) : rien n'est supprimé
    expect((await supprimerDevis(aLui))?.erreur).toBeTruthy();
    expect(await existe(a, aLui)).toBe(true);
    expect((await supprimerDevis(aUnAutre))?.erreur).toBeTruthy();
    expect(await existe(a, aUnAutre)).toBe(true);
  }, 180_000);

  test("depuis la fiche, le retour à la liste est demandé par la redirection", async () => {
    const { supprimerDevis } = await import("@/lib/actions/devis");
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const id = await creer(a, adminA, contactA, adminA, "DEV-T-000020", "BROUILLON");
    await expect(supprimerDevis(id, true)).rejects.toThrow("REDIRECT /app/facturation");
    expect(await existe(a, id)).toBe(false);
  }, 120_000);
});

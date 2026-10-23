import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { inflateSync } from "node:zlib";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, facture } from "@/db/schema";
import { recupererFacturePourClient } from "@/lib/pdf/donnees";
import { rendreDocumentCommercialPDF } from "@/lib/pdf/rendu";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock("@/lib/i18n/langue", () => ({ getT: async () => (texte: string) => texte }));
let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

/**
 * Réglage du filigrane : activé par défaut (rien ne change pour une entreprise qui n'y touche pas), désactivable par qui peut
 * modifier les paramètres, propre à chaque entreprise, et pris en compte dans le PDF.
 */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Filigrane A ${suffixe}`;
const nomB = `TEST Filigrane B ${suffixe}`;
let a = "", b = "", adminA = "", employeA = "", adminB = "", factureA = "";

function affichagesDImages(pdf: Buffer): number {
  let total = 0;
  for (const m of pdf.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      total += (inflateSync(Buffer.from(m[1], "latin1")).toString("latin1").match(/\/\w+\s+Do\b/g) ?? []).length;
    } catch {
      // flux non compressé : ignoré
    }
  }
  return total;
}
const lireReglage = async (id: string) => (await db.select({ f: entreprise.filigraneDocuments }).from(entreprise).where(eq(entreprise.id, id)))[0].f;

beforeAll(async () => {
  [{ id: a }] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "generique" }).returning({ id: entreprise.id });
  [{ id: b }] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "generique" }).returning({ id: entreprise.id });
  const u = async (entrepriseId: string, prefixe: string, role: "ADMIN" | "EMPLOYE") =>
    (await db.insert(utilisateur).values({ entrepriseId, email: `${prefixe}-${suffixe}@vertexone.test`, nomComplet: prefixe, role }).returning({ id: utilisateur.id }))[0].id;
  adminA = await u(a, "admin-a", "ADMIN");
  employeA = await u(a, "employe-a", "EMPLOYE");
  adminB = await u(b, "admin-b", "ADMIN");
  const contactA = (await avecEntreprise(a, (tx) => tx.insert(contact).values({ entrepriseId: a, nom: "Client A", telephone: "690000000", assigneAId: adminA }).returning({ id: contact.id })))[0].id;
  factureA = (await avecEntreprise(a, (tx) => tx.insert(facture).values({ entrepriseId: a, numero: `FAC-T-${suffixe}`, contactId: contactA, assigneAId: adminA, dateEcheance: new Date(Date.now() + 864e5), montantHT: 1000, montantTVA: 0, montantTTC: 1000 }).returning({ id: facture.id })))[0].id;
}, 120_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 120_000);

describe("Réglage du filigrane", () => {
  test("activé par défaut ; l'Administrateur le désactive puis le réactive, sans toucher une autre entreprise", async () => {
    const { definirFiligraneDocuments } = await import("@/lib/actions/entreprise-branding");
    expect(await lireReglage(a)).toBe(true);
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    expect(await definirFiligraneDocuments(false)).toBeNull();
    expect(await lireReglage(a)).toBe(false);
    expect(await lireReglage(b)).toBe(true);
    expect(await definirFiligraneDocuments(true)).toBeNull();
    expect(await lireReglage(a)).toBe(true);
  }, 120_000);

  test("un Employé (sans droit sur les paramètres) ne le change pas", async () => {
    const { definirFiligraneDocuments } = await import("@/lib/actions/entreprise-branding");
    connecte = { utilisateurId: employeA, entrepriseId: a, role: "EMPLOYE" };
    expect((await definirFiligraneDocuments(false))?.erreur).toBeTruthy();
    expect(await lireReglage(a)).toBe(true);
  }, 120_000);

  test("le réglage arrive jusqu'au PDF : désactivé, le filigrane disparaît (le logo d'en-tête reste)", async () => {
    const { definirFiligraneDocuments } = await import("@/lib/actions/entreprise-branding");
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const base = {
      typeDocument: "FACTURE" as const,
      numero: "FAC-T",
      dateEmission: new Date("2026-10-23"),
      client: { nom: "Client", societeCliente: null, niu: null, telephone: "690000000", email: null },
      lignes: [{ designation: "Honoraires", quantite: 1, prixUnitaire: 1000, tauxTVA: 0 }],
      montantHT: 1000,
      montantTVA: 0,
      montantTTC: 1000,
    };
    const rendre = async () => {
      const d = await avecEntreprise(a, (tx) => recupererFacturePourClient(tx, a, factureA));
      return rendreDocumentCommercialPDF({ ...base, entreprise: { ...d!.entreprise, logoUrl: PNG } });
    };
    await definirFiligraneDocuments(true);
    const avec = affichagesDImages(await rendre());
    await definirFiligraneDocuments(false);
    const sans = affichagesDImages(await rendre());
    expect(avec).toBeGreaterThan(sans);
    expect(sans).toBeGreaterThanOrEqual(1); // le logo d'en-tête, lui, reste
  }, 180_000);
});

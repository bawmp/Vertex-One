import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, devis, ligneDevis } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock("@/lib/i18n/langue", () => ({ getT: async () => (texte: string) => texte }));

let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

import { modifierDevis } from "@/lib/actions/devis";

/**
 * Modification d'un devis : possible en brouillon ou envoyé seulement, dans la portée de l'utilisateur et de son entreprise ;
 * numéro, client et devise ne bougent pas ; les totaux sont recalculés côté serveur.
 */
const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST ModifDevis A ${suffixe}`;
const nomB = `TEST ModifDevis B ${suffixe}`;
let a = "", b = "", adminA = "", employeA = "", adminB = "", contactA = "";

async function creer(statut: "BROUILLON" | "ENVOYE" | "ACCEPTE" | "REFUSE", extra: Record<string, unknown> = {}, assigne = adminA) {
  const [d] = await avecEntreprise(a, (tx) =>
    tx.insert(devis).values({ entrepriseId: a, numero: `DEV-${suffixe}-${Math.random().toString(36).slice(2, 7)}`, contactId: contactA, assigneAId: assigne, creeParId: adminA, statut, dateValidite: new Date(Date.now() + 864e5), montantHT: 1000, montantTVA: 0, montantTTC: 1000, ...extra }).returning({ id: devis.id })
  );
  await avecEntreprise(a, (tx) => tx.insert(ligneDevis).values({ entrepriseId: a, devisId: d.id, designation: "Ancienne ligne", quantite: 1, prixUnitaire: 1000, tauxTVA: 0 }));
  return d.id;
}
function formulaire(lignes: { designation: string; quantite: number; prixUnitaire: string | number; tauxTVA: number }[], date = "2030-01-15") {
  const f = new FormData();
  f.set("dateValidite", date);
  for (const l of lignes) {
    f.append("produitId", "");
    f.append("designation", l.designation);
    f.append("quantite", String(l.quantite));
    f.append("prixUnitaire", String(l.prixUnitaire));
    f.append("tauxTVA", String(l.tauxTVA));
  }
  return f;
}
const lire = async (id: string) => avecEntreprise(a, async (tx) => ({ d: (await tx.select().from(devis).where(eq(devis.id, id)))[0], l: await tx.select().from(ligneDevis).where(eq(ligneDevis.devisId, id)) }));
const modifier = async (id: string, f: FormData) => {
  try { return await modifierDevis(id, null, f); } catch (e) { return { redirection: (e as Error).message }; }
};

beforeAll(async () => {
  [{ id: a }] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "generique" }).returning({ id: entreprise.id });
  [{ id: b }] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "generique" }).returning({ id: entreprise.id });
  const u = async (entrepriseId: string, prefixe: string, role: "ADMIN" | "EMPLOYE") =>
    (await db.insert(utilisateur).values({ entrepriseId, email: `${prefixe}-${suffixe}@vertexone.test`, nomComplet: prefixe, role }).returning({ id: utilisateur.id }))[0].id;
  adminA = await u(a, "admin-a", "ADMIN");
  employeA = await u(a, "employe-a", "EMPLOYE");
  adminB = await u(b, "admin-b", "ADMIN");
  contactA = (await avecEntreprise(a, (tx) => tx.insert(contact).values({ entrepriseId: a, nom: "Client A", telephone: "690000000", assigneAId: adminA }).returning({ id: contact.id })))[0].id;
}, 120_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 120_000);

describe("modifierDevis", () => {
  test("un brouillon et un devis envoyé se modifient : lignes, totaux recalculés, date, numéro et client inchangés", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    for (const statut of ["BROUILLON", "ENVOYE"] as const) {
      const id = await creer(statut);
      const avant = (await lire(id)).d;
      const res = await modifier(id, formulaire([{ designation: "Nouvelle A", quantite: 2, prixUnitaire: 5000, tauxTVA: 19.25 }, { designation: "Nouvelle B", quantite: 1, prixUnitaire: 1000, tauxTVA: 0 }]));
      expect(res).toEqual({ redirection: `REDIRECT /app/facturation/devis/${id}` });
      const { d, l } = await lire(id);
      expect(l.map((x) => x.designation).sort()).toEqual(["Nouvelle A", "Nouvelle B"]);
      expect(d.montantHT).toBe(11000);
      expect(d.montantTTC).toBe(11000 + Math.round(10000 * 0.1925));
      expect(d.dateValidite.toISOString().slice(0, 10)).toBe("2030-01-15");
      expect(d.statut).toBe(statut);
      expect(d.numero).toBe(avant.numero);
      expect(d.contactId).toBe(avant.contactId);
    }
  }, 120_000);

  test("un devis accepté ou refusé ne se modifie pas", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    for (const statut of ["ACCEPTE", "REFUSE"] as const) {
      const id = await creer(statut);
      const res = await modifier(id, formulaire([{ designation: "Pirate", quantite: 1, prixUnitaire: 1, tauxTVA: 0 }]));
      expect(res).toEqual({ erreur: "Ce devis ne peut plus être modifié : le client a déjà répondu ou il n'est plus valable." });
      const { d, l } = await lire(id);
      expect(d.montantTTC).toBe(1000);
      expect(l.map((x) => x.designation)).toEqual(["Ancienne ligne"]);
    }
  }, 120_000);

  test("formulaire invalide (aucune ligne, date absente) : rien n'est modifié", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const id = await creer("BROUILLON");
    expect(await modifier(id, formulaire([]))).toEqual({ erreur: "Au moins une ligne est requise." });
    expect(await modifier(id, formulaire([{ designation: "X", quantite: 1, prixUnitaire: 10, tauxTVA: 0 }], ""))).toEqual({ erreur: "Formulaire invalide." });
    expect((await lire(id)).l.map((x) => x.designation)).toEqual(["Ancienne ligne"]);
  }, 120_000);

  test("un Employé sans droit de modification et une autre entreprise sont refusés (aucune fuite)", async () => {
    const id = await creer("BROUILLON");
    connecte = { utilisateurId: employeA, entrepriseId: a, role: "EMPLOYE" };
    expect(await modifier(id, formulaire([{ designation: "Pirate", quantite: 1, prixUnitaire: 1, tauxTVA: 0 }]))).toEqual({ erreur: "Vous n'avez pas le droit de modifier ce devis." });
    connecte = { utilisateurId: adminB, entrepriseId: b, role: "ADMIN" };
    expect(await modifier(id, formulaire([{ designation: "Pirate", quantite: 1, prixUnitaire: 1, tauxTVA: 0 }]))).toEqual({ erreur: "Devis introuvable." });
    const { d, l } = await lire(id);
    expect(d.montantTTC).toBe(1000);
    expect(l.map((x) => x.designation)).toEqual(["Ancienne ligne"]);
  }, 120_000);

  test("devis en devise : les prix sont saisis dans la devise et convertis au taux figé à la création", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    // 1 EUR = 655,957 FCFA (taux en millièmes de FCFA)
    const id = await creer("BROUILLON", { devise: "EUR", tauxChangeMilliemes: 655957, montantDeviseCentimes: 152 });
    expect(await modifier(id, formulaire([{ designation: "Service", quantite: 1, prixUnitaire: "100,00", tauxTVA: 0 }]))).toEqual({ redirection: `REDIRECT /app/facturation/devis/${id}` });
    const { d, l } = await lire(id);
    expect(l[0].prixUnitaire).toBe(65596);
    expect(d.montantTTC).toBe(65596);
    expect(d.devise).toBe("EUR");
    expect(d.tauxChangeMilliemes).toBe(655957);
    expect(d.montantDeviseCentimes).toBeGreaterThan(9900);
    expect(await modifier(id, formulaire([{ designation: "Service", quantite: 1, prixUnitaire: "100,123", tauxTVA: 0 }]))).toEqual({ erreur: "Prix invalide : deux décimales au plus." });
  }, 120_000);
});

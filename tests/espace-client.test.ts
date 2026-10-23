import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, facture, paiement, lead } from "@/db/schema";
import { adresseEspaceClientSure } from "@/lib/client-documents/espace-client";
import { creerLeadExterne, schemaLeadExterne } from "@/lib/api-externe/lead";
import { convertirLead } from "@/lib/crm/conversion";
import { recupererFacturePourClient } from "@/lib/pdf/donnees";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock("@/lib/i18n/langue", () => ({ getT: async () => (texte: string) => texte }));
let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

describe("Adresse de l'espace client — validation (le client y est REDIRIGÉ)", () => {
  test("accepte une adresse https propre", () => {
    expect(adresseEspaceClientSure("https://globalmobilitycm.com/suivi/abc123")).toBe("https://globalmobilitycm.com/suivi/abc123");
    expect(adresseEspaceClientSure("  https://exemple.cm/suivi?x=1  ")).toBe("https://exemple.cm/suivi?x=1");
  });
  test("refuse tout le reste", () => {
    for (const mauvais of ["http://exemple.cm/suivi", "javascript:alert(1)", "data:text/html,<b>x</b>", "//exemple.cm/x", "ftp://exemple.cm/x", "https://user:mdp@exemple.cm/x", "https://localhost/x", "https://exemple.cm/a b", "pas une adresse", "", "   ", null, undefined, "https://exemple.cm/" + "a".repeat(600)]) {
      expect(adresseEspaceClientSure(mauvais as string | null | undefined), String(mauvais)).toBeNull();
    }
  });
});

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Espace A ${suffixe}`;
const nomB = `TEST Espace B ${suffixe}`;
const LIEN = "https://globalmobilitycm.com/suivi/jeton-test-123";
// `contact` est sous RLS stricte : toute lecture ou écriture passe par avecEntreprise()
const lireUrl = async () => (await avecEntreprise(a, (tx) => tx.select({ u: contact.espaceClientUrl }).from(contact).where(eq(contact.id, contactA))))[0].u;
const definirUrl = async (url: string | null) => { await avecEntreprise(a, (tx) => tx.update(contact).set({ espaceClientUrl: url }).where(eq(contact.id, contactA))); };
let a = "", b = "", adminA = "", employeA = "", adminB = "", contactA = "";

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

describe("Espace client — du site à la fin de parcours", () => {
  test("l'API des leads refuse une adresse non https, accepte une adresse https", () => {
    const base = { nom: "Client Test", telephone: "690000000" };
    expect(schemaLeadExterne.safeParse({ ...base, espaceClientUrl: "http://exemple.cm/x" }).success).toBe(false);
    expect(schemaLeadExterne.safeParse({ ...base, espaceClientUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(schemaLeadExterne.safeParse({ ...base, espaceClientUrl: LIEN }).success).toBe(true);
    expect(schemaLeadExterne.safeParse(base).success).toBe(true);
  });

  test("le lead reçu par l'API garde l'adresse, la conversion la reprend sur le contact", async () => {
    const r = await avecEntreprise(a, (tx) => creerLeadExterne(tx, a, { nom: "Prospect Web", telephone: "690111111", source: "Site Test", reference: `ref-${suffixe}`, espaceClientUrl: LIEN }));
    if ("erreur" in r) throw new Error("lead non créé");
    const [leLead] = await avecEntreprise(a, (tx) => tx.select({ u: lead.espaceClientUrl }).from(lead).where(eq(lead.id, r.id)));
    expect(leLead.u).toBe(LIEN);
    const conv = await avecEntreprise(a, (tx) => convertirLead(tx, { entrepriseId: a, leadId: r.id, modifieParId: adminA }));
    const [leContact] = await avecEntreprise(a, (tx) => tx.select({ u: contact.espaceClientUrl }).from(contact).where(eq(contact.id, conv!.contactId)));
    expect(leContact.u).toBe(LIEN);
  }, 120_000);

  test("la page publique de la facture reçoit l'adresse du contact et la date du dernier paiement", async () => {
    await definirUrl(LIEN);
    const [f] = await avecEntreprise(a, (tx) =>
      tx.insert(facture).values({ entrepriseId: a, numero: `FAC-T-${suffixe}`, contactId: contactA, assigneAId: adminA, dateEcheance: new Date(Date.now() + 864e5), montantHT: 1000, montantTVA: 0, montantTTC: 1000 }).returning({ id: facture.id })
    );
    const avant = await avecEntreprise(a, (tx) => recupererFacturePourClient(tx, a, f.id));
    expect(avant?.espaceClientUrl).toBe(LIEN);
    expect(avant?.dernierPaiementLe).toBeNull();
    const quand = new Date(Date.now() - 60_000);
    await avecEntreprise(a, (tx) => tx.insert(paiement).values({ entrepriseId: a, factureId: f.id, montant: 1000, moyenPaiement: "mtn_momo", datePaiement: quand, saisiParId: adminA }));
    const apres = await avecEntreprise(a, (tx) => recupererFacturePourClient(tx, a, f.id));
    expect(apres?.dernierPaiementLe?.getTime()).toBe(quand.getTime());
    // une adresse stockée qui ne serait plus sûre n'est jamais transmise à la page
    await definirUrl("javascript:alert(1)");
    expect((await avecEntreprise(a, (tx) => recupererFacturePourClient(tx, a, f.id)))?.espaceClientUrl).toBeNull();
  }, 180_000);

  test("saisie manuelle sur la fiche : droit CRM, adresse https, jamais le contact d'une autre entreprise", async () => {
    const { definirEspaceClientContact } = await import("@/lib/actions/contact");
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    expect((await definirEspaceClientContact(contactA, "http://pas-https.cm/x"))?.erreur).toBeTruthy();
    expect((await definirEspaceClientContact(contactA, "javascript:alert(1)"))?.erreur).toBeTruthy();
    expect(await definirEspaceClientContact(contactA, LIEN)).toBeNull();
    expect(await lireUrl()).toBe(LIEN);
    // vider retire l'adresse
    expect(await definirEspaceClientContact(contactA, "")).toBeNull();
    expect(await lireUrl()).toBeNull();
    // une autre entreprise ne touche pas ce contact
    connecte = { utilisateurId: adminB, entrepriseId: b, role: "ADMIN" };
    expect((await definirEspaceClientContact(contactA, LIEN))?.erreur).toBeTruthy();
    expect(await lireUrl()).toBeNull();
    // un Employé (portée « propre ») ne modifie pas le contact d'un autre
    connecte = { utilisateurId: employeA, entrepriseId: a, role: "EMPLOYE" };
    expect((await definirEspaceClientContact(contactA, LIEN))?.erreur).toBeTruthy();
  }, 180_000);
});

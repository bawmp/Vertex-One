import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, devis, ligneDevis, demandeRevisionDevis } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";
import { nettoyerArguments, erreurArguments, lireContreProposition } from "@/lib/facturation/revision-devis";
import { definirRevisionDevis } from "@/lib/actions/entreprise-branding";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Map([["x-forwarded-for", "203.0.113.9"]]) }));
vi.mock("@/lib/i18n/langue", () => ({ getT: async () => (texte: string) => texte }));
const taches = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock("next/server", async () => {
  const reel = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...reel, after: (fn: () => unknown) => { taches.push(Promise.resolve().then(fn)); } };
});
const courriers = vi.hoisted(() => [] as { to: string; subject: string; html: string }[]);
vi.mock("@/lib/email/client", () => ({ envoyerEmail: async (p: { to: string; subject: string; html: string }) => { courriers.push(p); return { envoye: true }; } }));
let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

import { demanderRevisionDevisPublic } from "@/lib/actions/client-documents";
import { modifierDevis } from "@/lib/actions/devis";
import { obtenirOuCreerLien } from "@/lib/client-documents/liens";

/**
 * Le client peut demander la révision d'un devis depuis son lien, mais il doit avancer au moins 3 arguments (phrases complètes,
 * distincts) : jamais une demande vide. Le jeton est l'unique autorisation ; l'équipe est prévenue ; modifier le devis traite la demande.
 */
const ARGS = ["Le prix est supérieur à celui de la concurrence", "Le délai de livraison est trop long pour nous", "Nous n'avons pas besoin de la formation incluse"];
const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST RevisionDevis A ${suffixe}`;
const nomB = `TEST RevisionDevis B ${suffixe}`;
let a = "", b = "", adminA = "", contactA = "", adminB = "";

async function creer(entrepriseId: string, statut: "BROUILLON" | "ENVOYE" | "ACCEPTE", validiteJours = 10) {
  const [d] = await avecEntreprise(entrepriseId, (tx) =>
    tx.insert(devis).values({ entrepriseId, numero: `DEV-${suffixe}-${Math.random().toString(36).slice(2, 7)}`, contactId: contactA, assigneAId: adminA, creeParId: adminA, statut, dateValidite: new Date(Date.now() + validiteJours * 864e5), montantHT: 1000, montantTVA: 0, montantTTC: 1000 }).returning({ id: devis.id })
  );
  await avecEntreprise(entrepriseId, (tx) => tx.insert(ligneDevis).values({ entrepriseId, devisId: d.id, designation: "Ligne", quantite: 1, prixUnitaire: 1000, tauxTVA: 0 }));
  const jeton = await avecEntreprise(entrepriseId, (tx) => obtenirOuCreerLien(tx, entrepriseId, { devisId: d.id }));
  return { id: d.id, jeton };
}
const demandes = (id: string) => avecEntreprise(a, (tx) => tx.select().from(demandeRevisionDevis).where(eq(demandeRevisionDevis.devisId, id)));

beforeAll(async () => {
  [{ id: a }] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "generique" }).returning({ id: entreprise.id });
  [{ id: b }] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "generique" }).returning({ id: entreprise.id });
  adminA = (await db.insert(utilisateur).values({ entrepriseId: a, email: `admin-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN" }).returning({ id: utilisateur.id }))[0].id;
  adminB = (await db.insert(utilisateur).values({ entrepriseId: b, email: `admin-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN" }).returning({ id: utilisateur.id }))[0].id;
  contactA = (await avecEntreprise(a, (tx) => tx.insert(contact).values({ entrepriseId: a, nom: "Client A", telephone: "690000000", assigneAId: adminA }).returning({ id: contact.id })))[0].id;
}, 120_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 120_000);

describe("règles des arguments (pures)", () => {
  test("3 arguments minimum, phrases complètes, distincts", () => {
    expect(erreurArguments(nettoyerArguments(ARGS))).toBeNull();
    expect(erreurArguments(nettoyerArguments(["Trop cher", "Trop long", "Pas utile"]))).toMatch(/phrase complète/);
    expect(erreurArguments(nettoyerArguments(ARGS.slice(0, 2)))).toMatch(/au moins 3/);
    expect(erreurArguments(nettoyerArguments(["", "   ", ...ARGS.slice(0, 2)]))).toMatch(/au moins 3/);
    expect(erreurArguments(nettoyerArguments([ARGS[0], ARGS[0].toUpperCase(), ARGS[1]]))).toMatch(/différents/);
    expect(erreurArguments(nettoyerArguments(["aaaaaaaaaaaaaaaaaaaa bb cc", ARGS[1], ARGS[2]]))).toMatch(/phrase complète/);
    expect(erreurArguments(nettoyerArguments(Array.from({ length: 7 }, (_, i) => `Argument numéro ${i} bien développé`)))).toMatch(/Six/);
  });
});

describe("contre-proposition (règles pures)", () => {
  const fcfa = { montantTTC: 100000, devise: null, tauxChangeMilliemes: null };
  test("facultative ; montant entier positif inférieur au devis ; devise convertie au taux figé", () => {
    expect(lireContreProposition("", "", fcfa)).toEqual({ montant: null, conditions: null });
    expect(lireContreProposition("85 000", "  Livraison  en 2 semaines ", fcfa)).toEqual({ montant: 85000, conditions: "Livraison en 2 semaines" });
    expect(lireContreProposition("100000", "", fcfa)).toHaveProperty("erreur");
    expect(lireContreProposition("0", "", fcfa)).toHaveProperty("erreur");
    expect(lireContreProposition("85,5", "", fcfa)).toHaveProperty("erreur");
    expect(lireContreProposition("abc", "", fcfa)).toHaveProperty("erreur");
    const eur = { montantTTC: 655957, devise: "EUR", tauxChangeMilliemes: 655957 };
    expect(lireContreProposition("900,00", "", eur)).toEqual({ montant: 590361, conditions: null });
    expect(lireContreProposition("1000", "", eur)).toHaveProperty("erreur");
  });
});

describe("demanderRevisionDevisPublic", () => {
  test("avec 3 arguments : la demande est enregistrée et l'équipe prévenue par email, le devis reste envoyé", async () => {
    const { id, jeton } = await creer(a, "ENVOYE");
    const r = await demanderRevisionDevisPublic(jeton, ARGS);
    expect(r?.succes).toMatch(/transmise/);
    await Promise.all(taches.splice(0));
    const lignes = await demandes(id);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].message.split("\n")).toEqual(ARGS);
    expect(lignes[0].clientIp).toBe("203.0.113.9");
    expect(lignes[0].traiteLe).toBeNull();
    expect((await avecEntreprise(a, (tx) => tx.select({ s: devis.statut }).from(devis).where(eq(devis.id, id))))[0].s).toBe("ENVOYE");
    expect(courriers.some((c) => c.to === `admin-a-${suffixe}@vertexone.test` && /demande la révision/.test(c.subject) && c.html.includes("<li>"))).toBe(true);
  }, 120_000);

  test("moins de 3 arguments, arguments trop courts ou répétés : rien n'est enregistré", async () => {
    const { id, jeton } = await creer(a, "ENVOYE");
    expect((await demanderRevisionDevisPublic(jeton, ARGS.slice(0, 2)))?.erreur).toMatch(/au moins 3/);
    expect((await demanderRevisionDevisPublic(jeton, ["Trop cher", "Trop long", "Inutile"]))?.erreur).toMatch(/phrase complète/);
    expect((await demanderRevisionDevisPublic(jeton, [ARGS[0], ARGS[0], ARGS[1]]))?.erreur).toMatch(/différents/);
    expect(await demandes(id)).toHaveLength(0);
  }, 120_000);

  test("lien inconnu, devis accepté ou expiré : refusé", async () => {
    expect((await demanderRevisionDevisPublic("jeton-inexistant-" + suffixe, ARGS))?.erreur).toMatch(/pas valide/);
    const accepte = await creer(a, "ACCEPTE");
    expect((await demanderRevisionDevisPublic(accepte.jeton, ARGS))?.erreur).toMatch(/plus disponible/);
    const expire = await creer(a, "ENVOYE", -2);
    expect((await demanderRevisionDevisPublic(expire.jeton, ARGS))?.erreur).toMatch(/expiré/);
    expect(await demandes(accepte.id)).toHaveLength(0);
    expect(await demandes(expire.id)).toHaveLength(0);
  }, 120_000);

  test("5 demandes par heure et par devis au plus", async () => {
    const { id, jeton } = await creer(a, "ENVOYE");
    for (let i = 0; i < 5; i++) expect((await demanderRevisionDevisPublic(jeton, ARGS))?.succes).toBeTruthy();
    expect((await demanderRevisionDevisPublic(jeton, ARGS))?.erreur).toMatch(/plusieurs demandes/);
    expect(await demandes(id)).toHaveLength(5);
    await Promise.all(taches.splice(0));
  }, 120_000);

  test("une autre entreprise ne voit jamais les demandes (RLS)", async () => {
    const { id, jeton } = await creer(a, "ENVOYE");
    await demanderRevisionDevisPublic(jeton, ARGS);
    await Promise.all(taches.splice(0));
    expect(await avecEntreprise(b, (tx) => tx.select().from(demandeRevisionDevis).where(eq(demandeRevisionDevis.devisId, id)))).toHaveLength(0);
    expect(await avecEntreprise(b, (tx) => tx.select().from(demandeRevisionDevis))).toHaveLength(0);
  }, 120_000);

  test("avec une contre-proposition : montant et conditions enregistrés, annoncés dans l'email ; montant trop élevé refusé", async () => {
    const { id, jeton } = await creer(a, "ENVOYE");
    expect((await demanderRevisionDevisPublic(jeton, ARGS, { montant: "1000", conditions: "" }))?.erreur).toMatch(/inférieur au montant actuel/);
    expect(await demandes(id)).toHaveLength(0);
    courriers.length = 0;
    expect((await demanderRevisionDevisPublic(jeton, ARGS, { montant: "800", conditions: "Paiement en deux fois" }))?.succes).toBeTruthy();
    await Promise.all(taches.splice(0));
    const [l] = await demandes(id);
    expect(l.contreMontant).toBe(800);
    expect(l.contreConditions).toBe("Paiement en deux fois");
    expect(courriers.some((c) => c.html.includes("Contre-proposition") && c.html.includes("Paiement en deux fois"))).toBe(true);
  }, 120_000);

  test("une entreprise peut désactiver la fonction : le serveur refuse toute demande ; réactivée, elle repasse", async () => {
    const { id, jeton } = await creer(a, "ENVOYE");
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    expect(await definirRevisionDevis(false)).toBeNull();
    expect((await demanderRevisionDevisPublic(jeton, ARGS))?.erreur).toMatch(/n'accepte pas les demandes de révision/);
    expect(await demandes(id)).toHaveLength(0);
    expect(await definirRevisionDevis(true)).toBeNull();
    expect((await demanderRevisionDevisPublic(jeton, ARGS))?.succes).toBeTruthy();
    await Promise.all(taches.splice(0));
  }, 120_000);

  test("un Employé sans droit sur les paramètres ne peut pas changer le réglage", async () => {
    const employe = (await db.insert(utilisateur).values({ entrepriseId: a, email: `employe-a-${suffixe}@vertexone.test`, nomComplet: "Employé A", role: "EMPLOYE" }).returning({ id: utilisateur.id }))[0].id;
    connecte = { utilisateurId: employe, entrepriseId: a, role: "EMPLOYE" };
    expect(await definirRevisionDevis(false)).toEqual({ erreur: "Vous n'avez pas le droit de modifier les réglages des devis de l'entreprise." });
  }, 120_000);

  test("modifier le devis traite les demandes en attente", async () => {
    const { id, jeton } = await creer(a, "ENVOYE");
    await demanderRevisionDevisPublic(jeton, ARGS);
    await Promise.all(taches.splice(0));
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const f = new FormData();
    f.set("dateValidite", "2030-01-15");
    f.append("produitId", ""); f.append("designation", "Ligne revue"); f.append("quantite", "1"); f.append("prixUnitaire", "800"); f.append("tauxTVA", "0");
    await expect(modifierDevis(id, null, f)).rejects.toThrow(`REDIRECT /app/facturation/devis/${id}`);
    const lignes = await demandes(id);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].traiteLe).not.toBeNull();
  }, 120_000);
});

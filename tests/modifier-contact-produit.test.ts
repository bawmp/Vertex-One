import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, compteClient, produit } from "@/db/schema";
import { modifierContact } from "@/lib/actions/contact";
import { modifierProduit } from "@/lib/actions/produit";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock("@/lib/i18n/langue", () => ({ getT: async () => (texte: string) => texte }));
let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

/**
 * Modifier un contact enregistré et un produit/service du catalogue : droits par rôle, portée du CRM, jamais la donnée
 * d'une autre entreprise (même avec son identifiant), validation, et rien ne change en cas de refus.
 */
const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Modif A ${suffixe}`;
const nomB = `TEST Modif B ${suffixe}`;
let a = "", b = "";
let adminA = "", managerA = "", employeA = "", clientA = "", adminB = "";
let contactAdmin = "", contactEmploye = "", contactB = "", compteA = "", compteB = "", produitA = "", produitB = "";

/** Une modification réussie redirige vers la fiche (la redirection simulée lève une erreur « REDIRECT … »). */
async function modifier(contactId: string, champs: Record<string, string>): Promise<{ erreur?: string } | { redirige: string } | null> {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) f.set(cle, valeur);
  try {
    return await modifierContact(contactId, null, f);
  } catch (e) {
    const message = (e as Error).message;
    if (message.startsWith("REDIRECT ")) return { redirige: message.slice("REDIRECT ".length) };
    throw e;
  }
}
const formulaire = (champs: Record<string, string>) => {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) f.set(cle, valeur);
  return f;
};
const lireContact = async (id: string, entrepriseId = a) => (await avecEntreprise(entrepriseId, (tx) => tx.select().from(contact).where(eq(contact.id, id))))[0];
const lireProduit = async (id: string, entrepriseId = a) => (await avecEntreprise(entrepriseId, (tx) => tx.select().from(produit).where(eq(produit.id, id))))[0];
const BASE = { nom: "Jean Mbarga", telephone: "690111222", fonction: "", email: "", compteId: "" };

beforeAll(async () => {
  [{ id: a }] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "generique" }).returning({ id: entreprise.id });
  [{ id: b }] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "generique" }).returning({ id: entreprise.id });
  const u = async (entrepriseId: string, prefixe: string, role: "ADMIN" | "MANAGER" | "EMPLOYE" | "CLIENT") =>
    (await db.insert(utilisateur).values({ entrepriseId, email: `${prefixe}-${suffixe}@vertexone.test`, nomComplet: prefixe, role }).returning({ id: utilisateur.id }))[0].id;
  adminA = await u(a, "admin-a", "ADMIN");
  managerA = await u(a, "manager-a", "MANAGER");
  employeA = await u(a, "employe-a", "EMPLOYE");
  clientA = await u(a, "client-a", "CLIENT");
  adminB = await u(b, "admin-b", "ADMIN");

  await avecEntreprise(a, async (tx) => {
    [{ id: compteA }] = await tx.insert(compteClient).values({ entrepriseId: a, nom: "Société A" }).returning({ id: compteClient.id });
    [{ id: contactAdmin }] = await tx.insert(contact).values({ entrepriseId: a, nom: "Contact Admin", telephone: "690000001", email: "ancien@exemple.test", fonction: "Directeur", assigneAId: adminA }).returning({ id: contact.id });
    [{ id: contactEmploye }] = await tx.insert(contact).values({ entrepriseId: a, nom: "Contact Employé", telephone: "690000002", assigneAId: employeA }).returning({ id: contact.id });
    [{ id: produitA }] = await tx
      .insert(produit)
      .values({ entrepriseId: a, type: "BIEN", nom: "Ordinateur", description: "Portable 15 pouces", prixVente: 400000, prixAchat: 300000, suiviStock: true, stockActuel: 5, creeParId: adminA })
      .returning({ id: produit.id });
  });
  await avecEntreprise(b, async (tx) => {
    [{ id: compteB }] = await tx.insert(compteClient).values({ entrepriseId: b, nom: "Société B" }).returning({ id: compteClient.id });
    [{ id: contactB }] = await tx.insert(contact).values({ entrepriseId: b, nom: "Contact B", telephone: "690000003", assigneAId: adminB }).returning({ id: contact.id });
    [{ id: produitB }] = await tx.insert(produit).values({ entrepriseId: b, type: "SERVICE", nom: "Audit", prixVente: 50000, creeParId: adminB }).returning({ id: produit.id });
  });
}, 120_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 120_000);

describe("Modifier un contact enregistré", () => {
  test("l'Administrateur modifie les informations, rattache puis détache la société, et vide la fonction et l'email", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const r1 = await modifier(contactAdmin, { nom: "  Marie Ndzana  ", telephone: "699888777", fonction: "Directrice achats", email: "marie@exemple.test", compteId: compteA });
    expect(r1).toEqual({ redirige: `/app/contacts/${contactAdmin}` });
    expect(await lireContact(contactAdmin)).toMatchObject({ nom: "Marie Ndzana", telephone: "699888777", fonction: "Directrice achats", email: "marie@exemple.test", compteId: compteA, assigneAId: adminA });

    await modifier(contactAdmin, { ...BASE, nom: "Marie Ndzana", telephone: "699888777" });
    expect(await lireContact(contactAdmin)).toMatchObject({ nom: "Marie Ndzana", fonction: null, email: null, compteId: null });
  }, 120_000);

  test("valeurs invalides refusées (nom trop court, téléphone trop court, email invalide) : rien ne change", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const avant = await lireContact(contactAdmin);
    expect(await modifier(contactAdmin, { ...BASE, nom: "A" })).toEqual({ erreur: "Le nom est trop court." });
    expect(await modifier(contactAdmin, { ...BASE, telephone: "123" })).toEqual({ erreur: "Numéro de téléphone invalide." });
    expect(await modifier(contactAdmin, { ...BASE, email: "pas-un-email" })).toEqual({ erreur: "Adresse email invalide." });
    expect(await lireContact(contactAdmin)).toEqual(avant);
  }, 120_000);

  test("un Employé modifie SES contacts mais pas ceux d'un collègue (portée du CRM)", async () => {
    connecte = { utilisateurId: employeA, entrepriseId: a, role: "EMPLOYE" };
    expect(await modifier(contactEmploye, { ...BASE, nom: "Contact Employé modifié" })).toEqual({ redirige: `/app/contacts/${contactEmploye}` });
    expect((await lireContact(contactEmploye)).nom).toBe("Contact Employé modifié");

    const avant = await lireContact(contactAdmin);
    expect(await modifier(contactAdmin, { ...BASE, nom: "Piraté" })).toEqual({ erreur: "Contact introuvable." });
    expect(await lireContact(contactAdmin)).toEqual(avant);
  }, 120_000);

  test("un client du portail (aucun droit CRM) ne peut rien modifier", async () => {
    connecte = { utilisateurId: clientA, entrepriseId: a, role: "CLIENT" };
    expect(await modifier(contactEmploye, { ...BASE, nom: "Piraté" })).toEqual({ erreur: "Vous n'avez pas le droit de modifier ce contact." });
    expect((await lireContact(contactEmploye)).nom).toBe("Contact Employé modifié");
  }, 120_000);

  test("FUITE ENTRE ENTREPRISES : ni le contact ni la société d'une autre entreprise ne sont atteignables", async () => {
    // L'Administrateur de B vise le contact de A avec son identifiant.
    connecte = { utilisateurId: adminB, entrepriseId: b, role: "ADMIN" };
    const avant = await lireContact(contactAdmin);
    expect(await modifier(contactAdmin, { ...BASE, nom: "Détourné" })).toEqual({ erreur: "Contact introuvable." });
    expect(await lireContact(contactAdmin)).toEqual(avant);

    // L'Administrateur de A rattache son contact à la société de B : refusé, le contact ne bouge pas.
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    expect(await modifier(contactAdmin, { ...BASE, nom: "Marie Ndzana", compteId: compteB })).toEqual({ erreur: "Société introuvable." });
    expect(await lireContact(contactAdmin)).toEqual(avant);
    expect((await lireContact(contactB, b)).nom).toBe("Contact B");
  }, 120_000);
});

describe("Modifier un produit ou service du catalogue", () => {
  test("l'Administrateur modifie nom, description et prix ; le type et le stock ne bougent jamais", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const r = await modifierProduit(produitA, null, formulaire({ nom: "  Ordinateur portable  ", description: "Portable 17 pouces", prixVente: "450000", prixAchat: "320000" }));
    expect(r).toBeNull();
    expect(await lireProduit(produitA)).toMatchObject({ nom: "Ordinateur portable", description: "Portable 17 pouces", prixVente: 450000, prixAchat: 320000, type: "BIEN", suiviStock: true, stockActuel: 5 });

    await modifierProduit(produitA, null, formulaire({ nom: "Ordinateur portable", description: "", prixVente: "450000", prixAchat: "320000" }));
    expect((await lireProduit(produitA)).description).toBeNull();
  }, 120_000);

  test("valeurs invalides refusées (nom trop court, prix négatif, prix décimal) : rien ne change", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const avant = await lireProduit(produitA);
    expect((await modifierProduit(produitA, null, formulaire({ nom: "A", prixVente: "1", prixAchat: "1" })))?.erreur).toBe("Le nom est trop court.");
    expect((await modifierProduit(produitA, null, formulaire({ nom: "Ordinateur", prixVente: "-5", prixAchat: "1" })))?.erreur).toBe("Le prix de vente ne peut pas être négatif.");
    expect((await modifierProduit(produitA, null, formulaire({ nom: "Ordinateur", prixVente: "10.5", prixAchat: "1" })))?.erreur).toBe("Le prix de vente doit être un nombre entier.");
    expect(await lireProduit(produitA)).toEqual(avant);
  }, 120_000);

  test("le Manager peut modifier le catalogue, l'Employé non (lecture seule)", async () => {
    connecte = { utilisateurId: managerA, entrepriseId: a, role: "MANAGER" };
    expect(await modifierProduit(produitA, null, formulaire({ nom: "Ordinateur manager", prixVente: "460000", prixAchat: "320000" }))).toBeNull();
    expect((await lireProduit(produitA)).nom).toBe("Ordinateur manager");

    connecte = { utilisateurId: employeA, entrepriseId: a, role: "EMPLOYE" };
    expect(await modifierProduit(produitA, null, formulaire({ nom: "Piraté", prixVente: "1", prixAchat: "1" }))).toEqual({ erreur: "Vous n'avez pas le droit de modifier ce produit." });
    expect((await lireProduit(produitA)).nom).toBe("Ordinateur manager");
  }, 120_000);

  test("FUITE ENTRE ENTREPRISES : le produit d'une autre entreprise reste intact, même avec son identifiant", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const r = await modifierProduit(produitB, null, formulaire({ nom: "Détourné", prixVente: "1", prixAchat: "1" }));
    expect(r).toEqual({ erreur: "Produit introuvable." });
    expect(await lireProduit(produitB, b)).toMatchObject({ nom: "Audit", prixVente: 50000 });
  }, 120_000);

  test("sans session, les deux actions redirigent vers la connexion", async () => {
    connecte = null;
    await expect(modifierProduit(produitA, null, formulaire({ nom: "X1", prixVente: "1", prixAchat: "1" }))).rejects.toThrow("REDIRECT /connexion");
    await expect(modifierContact(contactAdmin, null, formulaire(BASE))).rejects.toThrow("REDIRECT /connexion");
  }, 120_000);
});

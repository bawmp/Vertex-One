import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { db, avecEntreprise } from "@/db/client";
import { contact, entreprise, produit, utilisateur } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { prixPourListe, prixValide, remiseValide, nomListeValide } from "@/lib/produits/listes-prix-regles";
import { affecterListeAuContact, creerListe, definirPrixFixe, lireListe, listerListes, modifierListe, produitsAuPrixDuClient, supprimerListe } from "@/lib/produits/listes-prix";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Priorité 3.10 : listes de prix — remise globale, prix fixes par produit, rattachement à un client. */
describe("Listes de prix — règles pures", () => {
  test("le prix fixe l'emporte, sinon la remise (arrondie), sinon le catalogue", () => {
    expect(prixPourListe(10_000, { remisePourcent: 20 }, null)).toBe(8_000);
    expect(prixPourListe(10_000, { remisePourcent: 20 }, 7_500)).toBe(7_500);
    expect(prixPourListe(10_000, { remisePourcent: 20 }, 0)).toBe(0);
    expect(prixPourListe(999, { remisePourcent: 15 }, undefined)).toBe(849);
    expect(prixPourListe(10_000, null, 5_000)).toBe(10_000);
  });

  test("validations : nom, remise 0-100 entière, prix entier positif", () => {
    expect(nomListeValide("A")).toBe(false);
    expect(nomListeValide("Revendeurs")).toBe(true);
    expect(remiseValide(0)).toBe(true);
    expect(remiseValide(100)).toBe(true);
    expect(remiseValide(101)).toBe(false);
    expect(remiseValide(12.5)).toBe(false);
    expect(prixValide(-1)).toBe(false);
    expect(prixValide(1.5)).toBe(false);
    expect(prixValide(0)).toBe(true);
  });
});

describe("Listes de prix — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Prix A ${suffixe}`;
  const nomB = `TEST Prix B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let uB: string;
  let clientA = "";
  let clientB = "";
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce" }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [x] = await db.insert(utilisateur).values({ entrepriseId: A, email: `prix-a-${suffixe}@vertexone.test`, nomComplet: "Admin Prix A", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [y] = await db.insert(utilisateur).values({ entrepriseId: B, email: `prix-b-${suffixe}@vertexone.test`, nomComplet: "Admin Prix B", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = x.id;
    uB = y.id;
    await avecEntreprise(A, async (tx) => {
      const p = async (nom: string, prixVente: number) => (await tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom, prixVente, creeParId: uA }).returning({ id: produit.id }))[0].id;
      ids.savon = await p("Savon", 1_000);
      ids.huile = await p("Huile", 10_000);
      [{ id: clientA }] = await tx.insert(contact).values({ entrepriseId: A, nom: "Client A", telephone: "690111222", assigneAId: uA }).returning({ id: contact.id });
    });
    await avecEntreprise(B, async (tx) => {
      ids.autre = (await tx.insert(produit).values({ entrepriseId: B, type: "BIEN", nom: "Produit B", prixVente: 500, creeParId: uB }).returning({ id: produit.id }))[0].id;
      [{ id: clientB }] = await tx.insert(contact).values({ entrepriseId: B, nom: "Client B", telephone: "690333444", assigneAId: uB }).returning({ id: contact.id });
    });
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 60_000);

  test("créer une liste : nom unique, remise bornée", async () => {
    const r = await avecEntreprise(A, (tx) => creerListe(tx, A, { nom: "  Revendeurs  ", remisePourcent: 20 }));
    expect(r.ok).toBe(true);
    ids.liste = r.ok ? r.id! : "";
    expect((await avecEntreprise(A, (tx) => creerListe(tx, A, { nom: "Revendeurs", remisePourcent: 5 }))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => creerListe(tx, A, { nom: "Trop", remisePourcent: 150 }))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => creerListe(tx, A, { nom: "X", remisePourcent: 5 }))).ok).toBe(false);
  });

  test("prix fixe d'un produit, retrait, et rejet d'un prix invalide", async () => {
    expect((await avecEntreprise(A, (tx) => definirPrixFixe(tx, A, ids.liste, ids.huile, 7_500))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => definirPrixFixe(tx, A, ids.liste, ids.huile, -5))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => definirPrixFixe(tx, A, ids.liste, ids.huile, 7_500.5))).ok).toBe(false);
    const lue = await avecEntreprise(A, (tx) => lireListe(tx, A, ids.liste));
    const huile = lue!.produits.find((p) => p.id === ids.huile)!;
    const savon = lue!.produits.find((p) => p.id === ids.savon)!;
    expect(huile.prixApplique).toBe(7_500);
    expect(savon.prixApplique).toBe(800); // 1 000 − 20 %
    // retirer le prix fixe → la remise reprend
    await avecEntreprise(A, (tx) => definirPrixFixe(tx, A, ids.liste, ids.huile, null));
    const apres = await avecEntreprise(A, (tx) => lireListe(tx, A, ids.liste));
    expect(apres!.produits.find((p) => p.id === ids.huile)!.prixApplique).toBe(8_000);
    await avecEntreprise(A, (tx) => definirPrixFixe(tx, A, ids.liste, ids.huile, 7_500));
  });

  test("le catalogue vu par un client suit sa liste ; sans liste, tel quel", async () => {
    const catalogue = [{ id: ids.savon, nom: "Savon", prixVente: 1_000 }, { id: ids.huile, nom: "Huile", prixVente: 10_000 }];
    expect((await avecEntreprise(A, (tx) => affecterListeAuContact(tx, A, clientA, ids.liste))).ok).toBe(true);
    const [c] = await avecEntreprise(A, (tx) => tx.select({ l: contact.listePrixId }).from(contact).where(eq(contact.id, clientA)));
    const vu = await avecEntreprise(A, (tx) => produitsAuPrixDuClient(tx, A, c.l, catalogue));
    expect(vu.map((p) => p.prixVente)).toEqual([800, 7_500]);
    expect(await avecEntreprise(A, (tx) => produitsAuPrixDuClient(tx, A, null, catalogue))).toEqual(catalogue);
  });

  test("modifier la remise change les prix proposés ; un nom déjà pris est refusé", async () => {
    await avecEntreprise(A, (tx) => creerListe(tx, A, { nom: "Grossistes", remisePourcent: 30 }));
    const doublon = await avecEntreprise(A, (tx) => modifierListe(tx, A, ids.liste, { nom: "Grossistes", remisePourcent: 20 }));
    expect(doublon.ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => modifierListe(tx, A, ids.liste, { nom: "Revendeurs", remisePourcent: 50 }))).ok).toBe(true);
    const lue = await avecEntreprise(A, (tx) => lireListe(tx, A, ids.liste));
    expect(lue!.produits.find((p) => p.id === ids.savon)!.prixApplique).toBe(500);
    const resume = (await avecEntreprise(A, (tx) => listerListes(tx, A))).find((l) => l.id === ids.liste)!;
    expect(resume.prixFixes).toBe(1);
    expect(resume.clients).toBe(1);
  });

  test("FUITE ENTRE ENTREPRISES : une autre entreprise ne voit, ne modifie, n'utilise ni ne supprime la liste", async () => {
    expect(await avecEntreprise(B, (tx) => lireListe(tx, B, ids.liste))).toBeNull();
    expect((await avecEntreprise(B, (tx) => listerListes(tx, B))).length).toBe(0);
    expect((await avecEntreprise(B, (tx) => modifierListe(tx, B, ids.liste, { nom: "Piratée", remisePourcent: 99 }))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => definirPrixFixe(tx, B, ids.liste, ids.autre, 1))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => affecterListeAuContact(tx, B, clientB, ids.liste))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => supprimerListe(tx, B, ids.liste))).ok).toBe(false);
    // un contact de A ne peut pas non plus être rattaché depuis B, ni un produit de A figurer dans une liste de B
    const listeB = await avecEntreprise(B, (tx) => creerListe(tx, B, { nom: "Liste B", remisePourcent: 10 }));
    const idB = listeB.ok ? listeB.id! : "";
    expect((await avecEntreprise(B, (tx) => affecterListeAuContact(tx, B, clientA, idB))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => definirPrixFixe(tx, B, idB, ids.savon, 1))).ok).toBe(false);
    // la liste de A, même fournie telle quelle, ne change aucun prix côté B
    const catalogueB = [{ id: ids.autre, nom: "Produit B", prixVente: 500 }];
    expect(await avecEntreprise(B, (tx) => produitsAuPrixDuClient(tx, B, ids.liste, catalogueB))).toEqual(catalogueB);
    // la liste de A est intacte
    expect((await avecEntreprise(A, (tx) => lireListe(tx, A, ids.liste)))!.liste.nom).toBe("Revendeurs");
  });

  test("retirer la liste d'un client, puis supprimer la liste : le client retrouve le catalogue", async () => {
    expect((await avecEntreprise(A, (tx) => affecterListeAuContact(tx, A, clientA, null))).ok).toBe(true);
    await avecEntreprise(A, (tx) => affecterListeAuContact(tx, A, clientA, ids.liste));
    expect((await avecEntreprise(A, (tx) => supprimerListe(tx, A, ids.liste))).ok).toBe(true);
    const [c] = await avecEntreprise(A, (tx) => tx.select({ l: contact.listePrixId }).from(contact).where(and(eq(contact.id, clientA), eq(contact.entrepriseId, A))));
    expect(c.l).toBeNull();
    expect(await avecEntreprise(A, (tx) => lireListe(tx, A, ids.liste))).toBeNull();
  });
});

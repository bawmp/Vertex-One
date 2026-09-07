import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, compteClient, deal } from "@/db/schema";
import { resoudreClientVente } from "@/lib/facturation/client-document";
import type { UtilisateurConnecte } from "@/lib/session";

/**
 * Découplage Books/CRM (échange du 2026-09-07) — resoudreClientVente() est
 * le point d'entrée partagé des 5 actions de création Ventes
 * (creerDevis/creerBonCommandeVente/creerFactureRecurrente/creerRecuVente/
 * creerFactureAcompte) : le tester une fois ici couvre la logique commune
 * aux cinq, indépendamment de la table cible.
 */
describe("resoudreClientVente()", () => {
  let entrepriseId: string;
  let createurId: string;
  let autreUtilisateurId: string;
  let contactSeulId: string;
  let contactDuDealId: string;
  let compteId: string;
  let dealId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Résoudre Client", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [uCreateur] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "createur-resoudre-client@vertexone.test", nomComplet: "Créateur", role: "EMPLOYE" })
      .returning({ id: utilisateur.id });
    createurId = uCreateur.id;
    const [uAutre] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "autre-resoudre-client@vertexone.test", nomComplet: "Autre (Deal Owner)", role: "EMPLOYE" })
      .returning({ id: utilisateur.id });
    autreUtilisateurId = uAutre.id;

    const [c] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(compteClient).values({ entrepriseId, nom: "Société Résoudre Client" }).returning({ id: compteClient.id })
    );
    compteId = c.id;

    const [contactSeul, contactDuDeal] = await avecEntreprise(entrepriseId, async (tx) => {
      const [cs] = await tx
        .insert(contact)
        .values({ entrepriseId, nom: "Contact Seul", telephone: "+237690000090", assigneAId: createurId })
        .returning({ id: contact.id });
      const [cd] = await tx
        .insert(contact)
        .values({ entrepriseId, nom: "Contact Du Deal", telephone: "+237690000091", compteId, assigneAId: autreUtilisateurId })
        .returning({ id: contact.id });
      return [cs, cd];
    });
    contactSeulId = contactSeul.id;
    contactDuDealId = contactDuDeal.id;

    const [d] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(deal).values({ entrepriseId, titre: "Deal Résoudre Client", contactId: contactDuDealId, compteId, assigneAId: autreUtilisateurId }).returning({ id: deal.id })
    );
    dealId = d.id;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(deal).where(eq(deal.entrepriseId, entrepriseId));
      await tx.delete(contact).where(eq(contact.entrepriseId, entrepriseId));
      await tx.delete(compteClient).where(eq(compteClient.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, createurId));
    await db.delete(utilisateur).where(eq(utilisateur.id, autreUtilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  const utilisateurConnecte = (): UtilisateurConnecte => ({ utilisateurId: createurId, entrepriseId, role: "EMPLOYE" });

  test("via dealId : recopie contactId/compteId/assigneAId du Deal, jamais du créateur", async () => {
    const client = await avecEntreprise(entrepriseId, (tx) => resoudreClientVente(tx, utilisateurConnecte(), { dealId }));
    expect(client).toEqual({ dealId, contactId: contactDuDealId, compteId, assigneAId: autreUtilisateurId });
  });

  test("via contactId : compteId dénormalisé depuis le Contact, assigneAId devient le créateur (pas de sélecteur)", async () => {
    const client = await avecEntreprise(entrepriseId, (tx) => resoudreClientVente(tx, utilisateurConnecte(), { contactId: contactDuDealId }));
    expect(client).toEqual({ dealId: null, contactId: contactDuDealId, compteId, assigneAId: createurId });
  });

  test("via contactId sans Compte : compteId reste null", async () => {
    const client = await avecEntreprise(entrepriseId, (tx) => resoudreClientVente(tx, utilisateurConnecte(), { contactId: contactSeulId }));
    expect(client).toEqual({ dealId: null, contactId: contactSeulId, compteId: null, assigneAId: createurId });
  });

  test("dealId inconnu → null", async () => {
    const client = await avecEntreprise(entrepriseId, (tx) => resoudreClientVente(tx, utilisateurConnecte(), { dealId: "inexistant" }));
    expect(client).toBeNull();
  });

  test("contactId inconnu → null", async () => {
    const client = await avecEntreprise(entrepriseId, (tx) => resoudreClientVente(tx, utilisateurConnecte(), { contactId: "inexistant" }));
    expect(client).toBeNull();
  });

  test("ni dealId ni contactId → null", async () => {
    const client = await avecEntreprise(entrepriseId, (tx) => resoudreClientVente(tx, utilisateurConnecte(), {}));
    expect(client).toBeNull();
  });
});

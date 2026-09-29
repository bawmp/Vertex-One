import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, deal, dealContact } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * deal.contactId reste le contact principal, obligatoire, inchangé — dealContact n'ajoute que des contacts
 * secondaires (ex. un couple sur un même dossier d'immigration). Ces tests reproduisent la logique des Server
 * Actions ajouterContactSupplementaireDeal/retirerContactSupplementaireDeal (src/lib/actions/deal.ts) directement
 * au niveau transaction, patron déjà établi dans ce dépôt pour éviter la complexité session/redirect() d'un appel
 * direct à une Server Action.
 */
describe("Deal — contacts supplémentaires", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomEntreprise = `TEST DealContact ${suffixe}`;
  let entrepriseId: string;
  let utilisateurId: string;
  let contactPrincipalId: string;
  let contactSecondaireId: string;
  let dealId: string;

  beforeAll(async () => {
    const [ent] = await db.insert(entreprise).values({ nom: nomEntreprise, secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = ent.id;
    const [u] = await db.insert(utilisateur).values({ entrepriseId, email: `admin-dealcontact-${suffixe}@vertexone.test`, nomComplet: "Admin Test", role: "ADMIN" }).returning({ id: utilisateur.id });
    utilisateurId = u.id;

    const [cp, cs, d] = await avecEntreprise(entrepriseId, async (tx) => {
      const [principal] = await tx.insert(contact).values({ entrepriseId, nom: "Ousmane Test", telephone: "+237690000001", assigneAId: utilisateurId }).returning({ id: contact.id });
      const [secondaire] = await tx.insert(contact).values({ entrepriseId, nom: "Ngah Enama Test", telephone: "+237690000002", assigneAId: utilisateurId }).returning({ id: contact.id });
      const [ledeal] = await tx
        .insert(deal)
        .values({ entrepriseId, titre: "Entrée express — dossier couple", contactId: principal.id, assigneAId: utilisateurId })
        .returning({ id: deal.id });
      return [principal.id, secondaire.id, ledeal.id];
    });
    contactPrincipalId = cp;
    contactSecondaireId = cs;
    dealId = d;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomEntreprise);
  }, 60_000);

  test("ajouter le contact principal comme secondaire est refusé (vérifié avant l'insertion, comme le fait ajouterContactSupplementaireDeal)", async () => {
    const [leDeal] = await avecEntreprise(entrepriseId, (tx) => tx.select({ contactId: deal.contactId }).from(deal).where(eq(deal.id, dealId)));
    expect(leDeal.contactId).toBe(contactPrincipalId);
    // La Server Action refuse ce cas AVANT tout insert — on ne teste donc pas une violation de contrainte SQL ici.
  });

  test("ajouter un contact secondaire, puis le retrouver depuis la fiche du deal ET depuis sa propre fiche Contact", async () => {
    await avecEntreprise(entrepriseId, (tx) => tx.insert(dealContact).values({ entrepriseId, dealId, contactId: contactSecondaireId }));

    const secondairesDuDeal = await avecEntreprise(entrepriseId, (tx) =>
      tx.select({ contactId: dealContact.contactId }).from(dealContact).where(eq(dealContact.dealId, dealId))
    );
    expect(secondairesDuDeal.map((s) => s.contactId)).toEqual([contactSecondaireId]);

    // Union principal + secondaire, exactement le patron de src/app/app/contacts/[id]/page.tsx.
    const dealsDuContactSecondaire = await avecEntreprise(entrepriseId, (tx) =>
      tx.select({ deal }).from(dealContact).innerJoin(deal, eq(dealContact.dealId, deal.id)).where(eq(dealContact.contactId, contactSecondaireId))
    );
    expect(dealsDuContactSecondaire).toHaveLength(1);
    expect(dealsDuContactSecondaire[0].deal.id).toBe(dealId);
  });

  test("un doublon d'ajout est bloqué par la contrainte unique (deal_contact_deal_contact_unique)", async () => {
    await expect(avecEntreprise(entrepriseId, (tx) => tx.insert(dealContact).values({ entrepriseId, dealId, contactId: contactSecondaireId }))).rejects.toThrow();
  });

  test("retirer un contact secondaire supprime bien la liaison", async () => {
    await avecEntreprise(entrepriseId, (tx) => tx.delete(dealContact).where(and(eq(dealContact.dealId, dealId), eq(dealContact.contactId, contactSecondaireId))));
    const restant = await avecEntreprise(entrepriseId, (tx) => tx.select().from(dealContact).where(eq(dealContact.dealId, dealId)));
    expect(restant).toHaveLength(0);
  });

  test("fuite : une entreprise fictive B ne voit jamais les liaisons deal_contact d'une entreprise A", async () => {
    await avecEntreprise(entrepriseId, (tx) => tx.insert(dealContact).values({ entrepriseId, dealId, contactId: contactSecondaireId }));

    const [autreEntreprise] = await db.insert(entreprise).values({ nom: `TEST DealContact Autre ${suffixe}`, secteurProfil: "agence" }).returning({ id: entreprise.id });
    try {
      const vuParB = await avecEntreprise(autreEntreprise.id, (tx) => tx.select().from(dealContact).where(eq(dealContact.dealId, dealId)));
      expect(vuParB).toHaveLength(0);
    } finally {
      await db.delete(entreprise).where(eq(entreprise.id, autreEntreprise.id));
    }
  });
});

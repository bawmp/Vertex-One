import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, lead, contact, compteClient, deal, historiqueStatutDeal } from "@/db/schema";
import { convertirLead } from "@/lib/crm/conversion";

/**
 * Docs de référence Zoho CRM (échange du 2026-09-06) : la conversion d'un
 * Lead crée toujours un Contact et un Deal, et un Compte uniquement si le
 * Lead avait une société renseignée (cas B2B) — un particulier reste un
 * Contact sans Compte. Un Lead déjà converti ne peut pas l'être une seconde
 * fois.
 */
describe("CRM — conversion d'un Lead en Contact/Compte/Deal", () => {
  let entrepriseId: string;
  let utilisateurId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Conversion Lead", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-conversion-lead@vertexone.test", nomComplet: "Admin Conversion", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurId = u.id;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(historiqueStatutDeal).where(eq(historiqueStatutDeal.entrepriseId, entrepriseId));
      await tx.delete(deal).where(eq(deal.entrepriseId, entrepriseId));
      await tx.delete(contact).where(eq(contact.entrepriseId, entrepriseId));
      await tx.delete(compteClient).where(eq(compteClient.entrepriseId, entrepriseId));
      await tx.delete(lead).where(eq(lead.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("un lead avec société (B2B) crée un Compte, un Contact rattaché, et un Deal", async () => {
    const [leLead] = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .insert(lead)
        .values({ entrepriseId, nom: "Jean Mbarga", societeCliente: "Garage Mbarga SARL", telephone: "+237600000040", assigneAId: utilisateurId })
        .returning({ id: lead.id })
    );

    const resultat = await avecEntreprise(entrepriseId, (tx) => convertirLead(tx, { entrepriseId, leadId: leLead.id, modifieParId: utilisateurId }));
    expect(resultat).not.toBeNull();
    expect(resultat!.compteId).not.toBeNull();

    const [leCompte] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(compteClient).where(eq(compteClient.id, resultat!.compteId!)));
    expect(leCompte.nom).toBe("Garage Mbarga SARL");

    const [leContact] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(contact).where(eq(contact.id, resultat!.contactId)));
    expect(leContact.compteId).toBe(resultat!.compteId);
    expect(leContact.nom).toBe("Jean Mbarga");

    const [leDeal] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(deal).where(eq(deal.id, resultat!.dealId)));
    expect(leDeal.contactId).toBe(resultat!.contactId);
    expect(leDeal.compteId).toBe(resultat!.compteId);
    expect(leDeal.statut).toBe("QUALIFICATION");

    // Le passage en pipeline se journalise dès la création, comme pour tout
    // changement de statut (voir crm-historique-statut.test.ts).
    const historique = await avecEntreprise(entrepriseId, (tx) =>
      tx.select().from(historiqueStatutDeal).where(eq(historiqueStatutDeal.dealId, resultat!.dealId))
    );
    expect(historique).toHaveLength(1);
    expect(historique[0].ancienStatut).toBeNull();
    expect(historique[0].nouveauStatut).toBe("QUALIFICATION");

    const [leLeadApres] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(lead).where(eq(lead.id, leLead.id)));
    expect(leLeadApres.convertiLe).not.toBeNull();
    expect(leLeadApres.contactConvertiId).toBe(resultat!.contactId);
    expect(leLeadApres.dealConvertiId).toBe(resultat!.dealId);
  });

  test("un lead sans société (particulier) crée un Contact sans Compte", async () => {
    const [leLead] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(lead).values({ entrepriseId, nom: "Client Particulier", telephone: "+237600000041", assigneAId: utilisateurId }).returning({ id: lead.id })
    );

    const resultat = await avecEntreprise(entrepriseId, (tx) => convertirLead(tx, { entrepriseId, leadId: leLead.id, modifieParId: utilisateurId }));
    expect(resultat).not.toBeNull();
    expect(resultat!.compteId).toBeNull();

    const [leContact] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(contact).where(eq(contact.id, resultat!.contactId)));
    expect(leContact.compteId).toBeNull();

    const [leDeal] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(deal).where(eq(deal.id, resultat!.dealId)));
    expect(leDeal.compteId).toBeNull();
  });

  test("un lead déjà converti ne peut pas l'être une seconde fois", async () => {
    const [leLead] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(lead).values({ entrepriseId, nom: "Client Unique", telephone: "+237600000042", assigneAId: utilisateurId }).returning({ id: lead.id })
    );

    const premiere = await avecEntreprise(entrepriseId, (tx) => convertirLead(tx, { entrepriseId, leadId: leLead.id, modifieParId: utilisateurId }));
    expect(premiere).not.toBeNull();

    const deuxieme = await avecEntreprise(entrepriseId, (tx) => convertirLead(tx, { entrepriseId, leadId: leLead.id, modifieParId: utilisateurId }));
    expect(deuxieme).toBeNull();

    // Aucun deuxième Contact/Deal fantôme créé par la tentative refusée.
    const contactsDuLead = await avecEntreprise(entrepriseId, (tx) => tx.select().from(contact).where(eq(contact.id, premiere!.contactId)));
    expect(contactsDuLead).toHaveLength(1);
  });
});

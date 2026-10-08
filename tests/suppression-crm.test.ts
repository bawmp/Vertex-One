import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import {
  entreprise, utilisateur, contact, lead, deal, dealContact, devis, facture, dossier, document, interaction, tacheCrm, journalAccesDocument,
} from "@/db/schema";
import { supprimerLeadEnBase, supprimerContactEnBase, supprimerDealEnBase, expliquerRefus } from "@/lib/crm/suppression";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * Suppression d'un lead, d'un contact ou d'un deal (Administrateur). Les actions vérifient la session (indisponible
 * hors requête HTTP) : ces tests exécutent la logique de base de données qu'elles appellent, sur la base réelle, RLS
 * comprise — voir CLAUDE.md sur le patron de test des Server Actions.
 */
describe("Suppression CRM — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST SuppressionCRM A ${suffixe}`;
  const nomB = `TEST SuppressionCRM B ${suffixe}`;
  let entrepriseA: string;
  let entrepriseB: string;
  let adminId: string;
  let numero = 0;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseA = a.id;
    entrepriseB = b.id;
    const [u] = await db.insert(utilisateur).values({ entrepriseId: entrepriseA, email: `admin-suppcrm-${suffixe}@vertexone.test`, nomComplet: "Admin Suppression", role: "ADMIN" }).returning({ id: utilisateur.id });
    adminId = u.id;
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 90_000);

  const nouveauContact = (tx: Parameters<Parameters<typeof avecEntreprise>[1]>[0]) =>
    tx.insert(contact).values({ entrepriseId: entrepriseA, nom: `Client ${++numero}`, telephone: `+2376900000${10 + numero}`, assigneAId: adminId }).returning({ id: contact.id });

  test("lead : supprimé avec ses tâches ; rien d'une autre entreprise n'est touché", async () => {
    const { leadId, autreLeadId } = await avecEntreprise(entrepriseA, async (tx) => {
      const [l] = await tx.insert(lead).values({ entrepriseId: entrepriseA, nom: "Lead à supprimer", telephone: "+237600000101", assigneAId: adminId }).returning({ id: lead.id });
      const [l2] = await tx.insert(lead).values({ entrepriseId: entrepriseA, nom: "Lead à garder", telephone: "+237600000102", assigneAId: adminId }).returning({ id: lead.id });
      await tx.insert(tacheCrm).values({ entrepriseId: entrepriseA, leadId: l.id, objet: "Rappeler", assigneAId: adminId, creeParId: adminId });
      await tx.insert(tacheCrm).values({ entrepriseId: entrepriseA, leadId: l2.id, objet: "À garder", assigneAId: adminId, creeParId: adminId });
      return { leadId: l.id, autreLeadId: l2.id };
    });

    const r = await avecEntreprise(entrepriseA, (tx) => supprimerLeadEnBase(tx, leadId));
    expect(r.supprime).toBe(true);

    const reste = await avecEntreprise(entrepriseA, async (tx) => ({
      leads: await tx.select({ id: lead.id }).from(lead),
      taches: await tx.select({ objet: tacheCrm.objet }).from(tacheCrm),
    }));
    expect(reste.leads.map((l) => l.id)).toEqual([autreLeadId]);
    expect(reste.taches.map((t) => t.objet)).toEqual(["À garder"]);
  });

  test("contact sans élément comptable : supprimé avec son historique et ses pièces ; compte portail désactivé ; clés R2 rendues", async () => {
    const { contactId, portailId } = await avecEntreprise(entrepriseA, async (tx) => {
      const [portail] = await tx.insert(utilisateur).values({ entrepriseId: entrepriseA, email: `portail-${suffixe}@client.test`, nomComplet: "Client Portail", role: "CLIENT", statut: "ACTIF" }).returning({ id: utilisateur.id });
      const [c] = await tx.insert(contact).values({ entrepriseId: entrepriseA, nom: "Client Effaçable", telephone: "+237690000200", assigneAId: adminId, utilisateurId: portail.id }).returning({ id: contact.id });
      await tx.insert(interaction).values({ entrepriseId: entrepriseA, contactId: c.id, type: "email", contenu: "Bonjour", auteurId: adminId });
      await tx.insert(tacheCrm).values({ entrepriseId: entrepriseA, contactId: c.id, objet: "Relancer", assigneAId: adminId, creeParId: adminId });
      await tx.insert(document).values({ entrepriseId: entrepriseA, contactId: c.id, categorie: "PIECE_IDENTITE", nom: "passeport.pdf", cleStockage: "cle-r2-passeport", typeMime: "application/pdf", tailleOctets: 5, televerseParId: adminId });
      return { contactId: c.id, portailId: portail.id };
    });

    const r = await avecEntreprise(entrepriseA, (tx) => supprimerContactEnBase(tx, { entrepriseId: entrepriseA, auteurId: adminId, contactId }));
    expect(r.supprime).toBe(true);
    if (!r.supprime) return;
    expect(r.clesStockage).toEqual(["cle-r2-passeport"]);

    const apres = await avecEntreprise(entrepriseA, async (tx) => ({
      contact: await tx.select({ id: contact.id }).from(contact).where(eq(contact.id, contactId)),
      interactions: await tx.select({ id: interaction.id }).from(interaction).where(eq(interaction.contactId, contactId)),
      documents: await tx.select({ id: document.id }).from(document).where(eq(document.contactId, contactId)),
      journal: await tx.select({ action: journalAccesDocument.action }).from(journalAccesDocument),
      portail: await tx.select({ statut: utilisateur.statut }).from(utilisateur).where(eq(utilisateur.id, portailId)),
    }));
    expect(apres.contact).toHaveLength(0);
    expect(apres.interactions).toHaveLength(0);
    expect(apres.documents).toHaveLength(0);
    expect(apres.journal.some((j) => j.action === "suppression")).toBe(true); // la suppression d'une pièce privée est consignée
    expect(apres.portail[0].statut).toBe("DESACTIVE"); // l'accès au portail ne survit pas à la fiche
  });

  test("contact avec un devis, une facture, un dossier ou un deal : refusé, et RIEN n'est supprimé", async () => {
    const ids = await avecEntreprise(entrepriseA, async (tx) => {
      const [cDevis] = await nouveauContact(tx);
      const [cFacture] = await nouveauContact(tx);
      const [cDossier] = await nouveauContact(tx);
      const [cDeal] = await nouveauContact(tx);
      await tx.insert(devis).values({ entrepriseId: entrepriseA, numero: `DEV-${suffixe}`, contactId: cDevis.id, assigneAId: adminId, dateValidite: new Date(Date.now() + 86_400_000), montantHT: 1000, montantTVA: 192, montantTTC: 1192, creeParId: adminId });
      await tx.insert(facture).values({ entrepriseId: entrepriseA, numero: `FAC-${suffixe}`, contactId: cFacture.id, assigneAId: adminId, statut: "EMISE", montantHT: 1000, montantTVA: 192, montantTTC: 1192, dateEcheance: new Date(Date.now() + 86_400_000) });
      await tx.insert(dossier).values({ entrepriseId: entrepriseA, contactId: cDossier.id, titre: "Dossier", responsableId: adminId });
      await tx.insert(deal).values({ entrepriseId: entrepriseA, titre: "Deal du contact", contactId: cDeal.id, assigneAId: adminId });
      for (const c of [cDevis, cFacture, cDossier, cDeal]) await tx.insert(interaction).values({ entrepriseId: entrepriseA, contactId: c.id, type: "note", contenu: "à ne pas perdre", auteurId: adminId });
      return { devis: cDevis.id, facture: cFacture.id, dossier: cDossier.id, deal: cDeal.id };
    });

    for (const [nature, contactId] of Object.entries(ids)) {
      const r = await avecEntreprise(entrepriseA, (tx) => supprimerContactEnBase(tx, { entrepriseId: entrepriseA, auteurId: adminId, contactId }));
      expect(r.supprime, nature).toBe(false);
      if (r.supprime) continue;
      expect(r.blocages?.length, nature).toBeGreaterThan(0);
      expect(expliquerRefus(r, (s) => s), nature).toMatch(/\d+ /);
      const intact = await avecEntreprise(entrepriseA, async (tx) => ({
        contact: await tx.select({ id: contact.id }).from(contact).where(eq(contact.id, contactId)),
        interactions: await tx.select({ id: interaction.id }).from(interaction).where(eq(interaction.contactId, contactId)),
      }));
      expect(intact.contact, nature).toHaveLength(1);
      expect(intact.interactions, nature).toHaveLength(1);
    }
  });

  test("deal : sans facture il est supprimé et son devis survit détaché ; avec une facture il est refusé", async () => {
    const { dealLibre, dealFacture, devisId } = await avecEntreprise(entrepriseA, async (tx) => {
      const [c] = await nouveauContact(tx);
      const [libre] = await tx.insert(deal).values({ entrepriseId: entrepriseA, titre: "Deal libre", contactId: c.id, assigneAId: adminId }).returning({ id: deal.id });
      const [facture1] = await tx.insert(deal).values({ entrepriseId: entrepriseA, titre: "Deal facturé", contactId: c.id, assigneAId: adminId }).returning({ id: deal.id });
      await tx.insert(dealContact).values({ entrepriseId: entrepriseA, dealId: libre.id, contactId: c.id });
      const [d] = await tx.insert(devis).values({ entrepriseId: entrepriseA, numero: `DEV-DEAL-${suffixe}`, dealId: libre.id, contactId: c.id, assigneAId: adminId, dateValidite: new Date(Date.now() + 86_400_000), montantHT: 1000, montantTVA: 192, montantTTC: 1192, creeParId: adminId }).returning({ id: devis.id });
      await tx.insert(facture).values({ entrepriseId: entrepriseA, numero: `FAC-DEAL-${suffixe}`, dealId: facture1.id, contactId: c.id, assigneAId: adminId, statut: "EMISE", montantHT: 1000, montantTVA: 192, montantTTC: 1192, dateEcheance: new Date(Date.now() + 86_400_000) });
      return { dealLibre: libre.id, dealFacture: facture1.id, devisId: d.id };
    });

    expect((await avecEntreprise(entrepriseA, (tx) => supprimerDealEnBase(tx, dealLibre))).supprime).toBe(true);
    const apres = await avecEntreprise(entrepriseA, async (tx) => ({
      deal: await tx.select({ id: deal.id }).from(deal).where(eq(deal.id, dealLibre)),
      devis: await tx.select({ dealId: devis.dealId }).from(devis).where(eq(devis.id, devisId)),
    }));
    expect(apres.deal).toHaveLength(0);
    expect(apres.devis).toHaveLength(1); // le devis est conservé,
    expect(apres.devis[0].dealId).toBeNull(); // simplement détaché du deal supprimé

    const refus = await avecEntreprise(entrepriseA, (tx) => supprimerDealEnBase(tx, dealFacture));
    expect(refus.supprime).toBe(false);
    const toujoursLa = await avecEntreprise(entrepriseA, (tx) => tx.select({ id: deal.id }).from(deal).where(eq(deal.id, dealFacture)));
    expect(toujoursLa).toHaveLength(1);
  });

  test("fuite : l'entreprise B ne peut supprimer ni lead, ni contact, ni deal de l'entreprise A", async () => {
    const { contactId, leadId, dealId } = await avecEntreprise(entrepriseA, async (tx) => {
      const [c] = await nouveauContact(tx);
      const [l] = await tx.insert(lead).values({ entrepriseId: entrepriseA, nom: "Lead protégé", telephone: "+237600000301", assigneAId: adminId }).returning({ id: lead.id });
      const [d] = await tx.insert(deal).values({ entrepriseId: entrepriseA, titre: "Deal protégé", contactId: c.id, assigneAId: adminId }).returning({ id: deal.id });
      return { contactId: c.id, leadId: l.id, dealId: d.id };
    });

    const depuisB = await avecEntreprise(entrepriseB, async (tx) => ({
      contact: await supprimerContactEnBase(tx, { entrepriseId: entrepriseB, auteurId: adminId, contactId }),
      lead: await supprimerLeadEnBase(tx, leadId),
      deal: await supprimerDealEnBase(tx, dealId),
    }));
    expect(depuisB.contact.supprime).toBe(false);
    expect(depuisB.lead.supprime).toBe(false);
    expect(depuisB.deal.supprime).toBe(false);

    const intact = await avecEntreprise(entrepriseA, async (tx) => ({
      c: await tx.select({ id: contact.id }).from(contact).where(eq(contact.id, contactId)),
      l: await tx.select({ id: lead.id }).from(lead).where(eq(lead.id, leadId)),
      d: await tx.select({ id: deal.id }).from(deal).where(eq(deal.id, dealId)),
    }));
    expect([intact.c.length, intact.l.length, intact.d.length]).toEqual([1, 1, 1]);
  });
});

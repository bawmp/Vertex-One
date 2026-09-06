import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, lead, compteClient, contact, deal } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour les quatre
 * tables de la reconstruction Leads/Contacts/Comptes/Deals (échange du
 * 2026-09-06) — voir CLAUDE.md : "après chaque nouveau module touchant à des
 * données d'entreprise, un test délibéré doit vérifier qu'une entreprise
 * fictive ne peut techniquement pas accéder aux données d'une autre." Même
 * structure que tests/palier-2-fuite-rls.test.ts. historiqueStatutDeal est
 * déjà couvert par tests/crm-historique-statut.test.ts.
 */
describe("CRM — isolation RLS entre entreprises (lead/compte_client/contact/deal)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let leadMbargaId: string;
  let compteMbargaId: string;
  let contactMbargaId: string;
  let dealMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST CRM Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST CRM Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-crm-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-crm-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    // Kiro : au moins une ligne dans chaque table, pour vérifier que Mbarga
    // ne les voit jamais (tests plus bas).
    await avecEntreprise(kiroId, async (tx) => {
      await tx.insert(lead).values({ entrepriseId: kiroId, nom: "Lead Kiro", telephone: "+237600000030", assigneAId: utilisateurKiroId });
      const [compte] = await tx.insert(compteClient).values({ entrepriseId: kiroId, nom: "Compte Kiro" }).returning({ id: compteClient.id });
      const [c] = await tx
        .insert(contact)
        .values({ entrepriseId: kiroId, compteId: compte.id, nom: "Contact Kiro", telephone: "+237600000031", assigneAId: utilisateurKiroId })
        .returning({ id: contact.id });
      await tx.insert(deal).values({ entrepriseId: kiroId, titre: "Deal Kiro", contactId: c.id, compteId: compte.id, assigneAId: utilisateurKiroId });
    });

    const [lM, coM, ctM, dM] = await avecEntreprise(mbargaId, async (tx) => {
      const [l] = await tx
        .insert(lead)
        .values({ entrepriseId: mbargaId, nom: "Lead Mbarga", telephone: "+237600000032", assigneAId: utilisateurMbargaId })
        .returning({ id: lead.id });
      const [compte] = await tx.insert(compteClient).values({ entrepriseId: mbargaId, nom: "Compte Mbarga" }).returning({ id: compteClient.id });
      const [c] = await tx
        .insert(contact)
        .values({ entrepriseId: mbargaId, compteId: compte.id, nom: "Contact Mbarga", telephone: "+237600000033", assigneAId: utilisateurMbargaId })
        .returning({ id: contact.id });
      const [d] = await tx
        .insert(deal)
        .values({ entrepriseId: mbargaId, titre: "Deal Mbarga", contactId: c.id, compteId: compte.id, assigneAId: utilisateurMbargaId })
        .returning({ id: deal.id });
      return [l.id, compte.id, c.id, d.id];
    });
    leadMbargaId = lM;
    compteMbargaId = coM;
    contactMbargaId = ctM;
    dealMbargaId = dM;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(deal).where(eq(deal.entrepriseId, id));
        await tx.delete(contact).where(eq(contact.entrepriseId, id));
        await tx.delete(compteClient).where(eq(compteClient.entrepriseId, id));
        await tx.delete(lead).where(eq(lead.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas les leads d'une autre, même en lecture large", async () => {
    const vusParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(lead));
    expect(vusParKiro.some((l) => l.id === leadMbargaId)).toBe(false);

    const tentative = await avecEntreprise(kiroId, (tx) => tx.select().from(lead).where(eq(lead.id, leadMbargaId)));
    expect(tentative).toHaveLength(0);
  });

  test("une entreprise ne voit pas les comptes clients d'une autre", async () => {
    const vusParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(compteClient));
    expect(vusParKiro.some((c) => c.id === compteMbargaId)).toBe(false);
  });

  test("une entreprise ne peut pas lire, modifier ni supprimer le contact d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(contact).where(eq(contact.id, contactMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(contact).set({ nom: "Piraté depuis Kiro" }).where(eq(contact.id, contactMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(contact).where(eq(contact.id, contactMbargaId)));
    expect(reel.nom).not.toBe("Piraté depuis Kiro");

    await avecEntreprise(kiroId, (tx) => tx.delete(contact).where(eq(contact.id, contactMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(contact).where(eq(contact.id, contactMbargaId)));
    expect(toujoursLa).toBeDefined();
  });

  test("une entreprise ne voit pas le deal d'une autre, même en ciblant son id précis", async () => {
    const tentative = await avecEntreprise(kiroId, (tx) => tx.select().from(deal).where(eq(deal.id, dealMbargaId)));
    expect(tentative).toHaveLength(0);

    const vusParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(deal));
    expect(vusParKiro.some((d) => d.id === dealMbargaId)).toBe(false);
  });
});

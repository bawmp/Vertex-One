import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, deal, factureAcompte } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour les Factures
 * d'acompte (extensions Ventes, échange du 2026-09-07) — voir CLAUDE.md :
 * "après chaque nouveau module touchant à des données d'entreprise, un test
 * délibéré doit vérifier qu'une entreprise fictive ne peut techniquement pas
 * accéder aux données d'une autre."
 */
describe("Ventes — isolation RLS entre entreprises (facture_acompte)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let acompteMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST FA Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST FA Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-fa-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-fa-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const [aM] = await avecEntreprise(mbargaId, async (tx) => {
      const [c] = await tx
        .insert(contact)
        .values({ entrepriseId: mbargaId, nom: "Contact Mbarga", telephone: "+237600000096", assigneAId: utilisateurMbargaId })
        .returning({ id: contact.id });
      const [d] = await tx
        .insert(deal)
        .values({ entrepriseId: mbargaId, titre: "Deal Mbarga", contactId: c.id, assigneAId: utilisateurMbargaId })
        .returning({ id: deal.id });
      const [acompte] = await tx
        .insert(factureAcompte)
        .values({
          entrepriseId: mbargaId,
          numero: "ACO-MBARGA-0001",
          dealId: d.id,
          montant: 50000,
          montantRestant: 50000,
          creeParId: utilisateurMbargaId,
        })
        .returning({ id: factureAcompte.id });
      return [acompte.id];
    });
    acompteMbargaId = aM;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(factureAcompte).where(eq(factureAcompte.entrepriseId, id));
        await tx.delete(deal).where(eq(deal.entrepriseId, id));
        await tx.delete(contact).where(eq(contact.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas la facture d'acompte d'une autre, même en ciblant son id précis", async () => {
    const vusParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(factureAcompte));
    expect(vusParKiro.some((a) => a.id === acompteMbargaId)).toBe(false);

    const tentative = await avecEntreprise(kiroId, (tx) => tx.select().from(factureAcompte).where(eq(factureAcompte.id, acompteMbargaId)));
    expect(tentative).toHaveLength(0);
  });

  test("une entreprise ne peut pas modifier ni supprimer la facture d'acompte d'une autre", async () => {
    await avecEntreprise(kiroId, (tx) => tx.update(factureAcompte).set({ statut: "ANNULEE" }).where(eq(factureAcompte.id, acompteMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(factureAcompte).where(eq(factureAcompte.id, acompteMbargaId)));
    expect(reel.statut).toBe("EMISE");

    await avecEntreprise(kiroId, (tx) => tx.delete(factureAcompte).where(eq(factureAcompte.id, acompteMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(factureAcompte).where(eq(factureAcompte.id, acompteMbargaId)));
    expect(toujoursLa).toBeDefined();
  });
});

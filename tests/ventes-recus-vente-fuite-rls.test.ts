import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, deal, recuVente } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour les Reçus de
 * vente (extensions Ventes, échange du 2026-09-07) — voir CLAUDE.md :
 * "après chaque nouveau module touchant à des données d'entreprise, un test
 * délibéré doit vérifier qu'une entreprise fictive ne peut techniquement pas
 * accéder aux données d'une autre."
 */
describe("Ventes — isolation RLS entre entreprises (recu_vente)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let recuMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST RV Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST RV Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-rv-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-rv-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const [rM] = await avecEntreprise(mbargaId, async (tx) => {
      const [c] = await tx
        .insert(contact)
        .values({ entrepriseId: mbargaId, nom: "Contact Mbarga", telephone: "+237600000094", assigneAId: utilisateurMbargaId })
        .returning({ id: contact.id });
      const [d] = await tx
        .insert(deal)
        .values({ entrepriseId: mbargaId, titre: "Deal Mbarga", contactId: c.id, assigneAId: utilisateurMbargaId })
        .returning({ id: deal.id });
      const [recu] = await tx
        .insert(recuVente)
        .values({
          entrepriseId: mbargaId,
          numero: "REC-MBARGA-0001",
          dealId: d.id,
          montantHT: 5000,
          montantTVA: 0,
          montantTTC: 5000,
          moyenPaiement: "especes",
          creeParId: utilisateurMbargaId,
        })
        .returning({ id: recuVente.id });
      return [recu.id];
    });
    recuMbargaId = rM;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(recuVente).where(eq(recuVente.entrepriseId, id));
        await tx.delete(deal).where(eq(deal.entrepriseId, id));
        await tx.delete(contact).where(eq(contact.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas le reçu de vente d'une autre, même en ciblant son id précis", async () => {
    const vusParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(recuVente));
    expect(vusParKiro.some((r) => r.id === recuMbargaId)).toBe(false);

    const tentative = await avecEntreprise(kiroId, (tx) => tx.select().from(recuVente).where(eq(recuVente.id, recuMbargaId)));
    expect(tentative).toHaveLength(0);
  });

  test("une entreprise ne peut pas modifier ni supprimer le reçu de vente d'une autre", async () => {
    await avecEntreprise(kiroId, (tx) => tx.update(recuVente).set({ statut: "ANNULE" }).where(eq(recuVente.id, recuMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(recuVente).where(eq(recuVente.id, recuMbargaId)));
    expect(reel.statut).toBe("EMISE");

    await avecEntreprise(kiroId, (tx) => tx.delete(recuVente).where(eq(recuVente.id, recuMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(recuVente).where(eq(recuVente.id, recuMbargaId)));
    expect(toujoursLa).toBeDefined();
  });
});

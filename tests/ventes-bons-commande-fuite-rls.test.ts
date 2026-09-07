import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, deal, bonCommandeVente } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour les Bons de
 * commande client (Sales Orders, extensions Ventes, échange du 2026-09-07)
 * — voir CLAUDE.md : "après chaque nouveau module touchant à des données
 * d'entreprise, un test délibéré doit vérifier qu'une entreprise fictive ne
 * peut techniquement pas accéder aux données d'une autre."
 */
describe("Ventes — isolation RLS entre entreprises (bon_commande_vente)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let bcvMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST BCV Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST BCV Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-bcv-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-bcv-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const [bM] = await avecEntreprise(mbargaId, async (tx) => {
      const [c] = await tx
        .insert(contact)
        .values({ entrepriseId: mbargaId, nom: "Contact Mbarga", telephone: "+237600000090", assigneAId: utilisateurMbargaId })
        .returning({ id: contact.id });
      const [d] = await tx
        .insert(deal)
        .values({ entrepriseId: mbargaId, titre: "Deal Mbarga", contactId: c.id, assigneAId: utilisateurMbargaId })
        .returning({ id: deal.id });
      const [bcv] = await tx
        .insert(bonCommandeVente)
        .values({
          entrepriseId: mbargaId,
          numero: "BCV-MBARGA-0001",
          dealId: d.id,
          contactId: c.id,
          assigneAId: utilisateurMbargaId,
          montantHT: 20000,
          montantTVA: 0,
          montantTTC: 20000,
          creeParId: utilisateurMbargaId,
        })
        .returning({ id: bonCommandeVente.id });
      return [bcv.id];
    });
    bcvMbargaId = bM;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(bonCommandeVente).where(eq(bonCommandeVente.entrepriseId, id));
        await tx.delete(deal).where(eq(deal.entrepriseId, id));
        await tx.delete(contact).where(eq(contact.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas le bon de commande client d'une autre, même en ciblant son id précis", async () => {
    const vusParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(bonCommandeVente));
    expect(vusParKiro.some((bc) => bc.id === bcvMbargaId)).toBe(false);

    const tentative = await avecEntreprise(kiroId, (tx) => tx.select().from(bonCommandeVente).where(eq(bonCommandeVente.id, bcvMbargaId)));
    expect(tentative).toHaveLength(0);
  });

  test("une entreprise ne peut pas modifier ni supprimer le bon de commande client d'une autre", async () => {
    await avecEntreprise(kiroId, (tx) => tx.update(bonCommandeVente).set({ statut: "ANNULE" }).where(eq(bonCommandeVente.id, bcvMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(bonCommandeVente).where(eq(bonCommandeVente.id, bcvMbargaId)));
    expect(reel.statut).toBe("BROUILLON");

    await avecEntreprise(kiroId, (tx) => tx.delete(bonCommandeVente).where(eq(bonCommandeVente.id, bcvMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(bonCommandeVente).where(eq(bonCommandeVente.id, bcvMbargaId)));
    expect(toujoursLa).toBeDefined();
  });
});

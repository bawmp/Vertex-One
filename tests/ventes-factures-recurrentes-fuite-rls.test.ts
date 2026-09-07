import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, deal, factureRecurrente } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour les Factures
 * récurrentes (extensions Ventes, échange du 2026-09-07) — voir CLAUDE.md :
 * "après chaque nouveau module touchant à des données d'entreprise, un test
 * délibéré doit vérifier qu'une entreprise fictive ne peut techniquement pas
 * accéder aux données d'une autre."
 */
describe("Ventes — isolation RLS entre entreprises (facture_recurrente)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let profilMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST FR Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST FR Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-fr-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-fr-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const [pM] = await avecEntreprise(mbargaId, async (tx) => {
      const [c] = await tx
        .insert(contact)
        .values({ entrepriseId: mbargaId, nom: "Contact Mbarga", telephone: "+237600000091", assigneAId: utilisateurMbargaId })
        .returning({ id: contact.id });
      const [d] = await tx
        .insert(deal)
        .values({ entrepriseId: mbargaId, titre: "Deal Mbarga", contactId: c.id, assigneAId: utilisateurMbargaId })
        .returning({ id: deal.id });
      const [profil] = await tx
        .insert(factureRecurrente)
        .values({
          entrepriseId: mbargaId,
          dealId: d.id,
          libelle: "Abonnement Mbarga",
          frequence: "MENSUEL",
          dateDebut: new Date(),
          prochaineDateGeneration: new Date(),
          montantHT: 15000,
          montantTVA: 0,
          montantTTC: 15000,
          creeParId: utilisateurMbargaId,
        })
        .returning({ id: factureRecurrente.id });
      return [profil.id];
    });
    profilMbargaId = pM;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(factureRecurrente).where(eq(factureRecurrente.entrepriseId, id));
        await tx.delete(deal).where(eq(deal.entrepriseId, id));
        await tx.delete(contact).where(eq(contact.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas le profil récurrent d'une autre, même en ciblant son id précis", async () => {
    const vusParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(factureRecurrente));
    expect(vusParKiro.some((p) => p.id === profilMbargaId)).toBe(false);

    const tentative = await avecEntreprise(kiroId, (tx) => tx.select().from(factureRecurrente).where(eq(factureRecurrente.id, profilMbargaId)));
    expect(tentative).toHaveLength(0);
  });

  test("une entreprise ne peut pas modifier ni supprimer le profil récurrent d'une autre", async () => {
    await avecEntreprise(kiroId, (tx) => tx.update(factureRecurrente).set({ statut: "TERMINE" }).where(eq(factureRecurrente.id, profilMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(factureRecurrente).where(eq(factureRecurrente.id, profilMbargaId)));
    expect(reel.statut).toBe("ACTIF");

    await avecEntreprise(kiroId, (tx) => tx.delete(factureRecurrente).where(eq(factureRecurrente.id, profilMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(factureRecurrente).where(eq(factureRecurrente.id, profilMbargaId)));
    expect(toujoursLa).toBeDefined();
  });
});

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, fournisseur, factureFournisseur, paiementEffectue, compteComptable } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour la deuxième
 * tranche du cycle Achats (Factures fournisseur/Paiements effectués,
 * échange du 2026-09-07) — voir CLAUDE.md : "après chaque nouveau module
 * touchant à des données d'entreprise, un test délibéré doit vérifier
 * qu'une entreprise fictive ne peut techniquement pas accéder aux données
 * d'une autre."
 */
describe("Achats — isolation RLS entre entreprises (facture_fournisseur/paiement_effectue)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let factureMbargaId: string;
  let paiementMbargaId: string;
  let compteChargeId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST FactFourn Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST FactFourn Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-factfourn-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-factfourn-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const [uneLigne] = await db.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.numero, "605000"));
    compteChargeId = uneLigne.id;

    const [fM, pM] = await avecEntreprise(mbargaId, async (tx) => {
      const [f] = await tx
        .insert(fournisseur)
        .values({ entrepriseId: mbargaId, nom: "Fournisseur Mbarga", telephone: "+237600000052" })
        .returning({ id: fournisseur.id });
      const [facture] = await tx
        .insert(factureFournisseur)
        .values({
          entrepriseId: mbargaId,
          numero: "FA-MBARGA-0001",
          fournisseurId: f.id,
          compteComptableId: compteChargeId,
          dateFacture: new Date(),
          dateEcheance: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
          montantHT: 50000,
          montantTVA: 0,
          montantTTC: 50000,
          assigneAId: utilisateurMbargaId,
          creeParId: utilisateurMbargaId,
        })
        .returning({ id: factureFournisseur.id });
      const [paiement] = await tx
        .insert(paiementEffectue)
        .values({
          entrepriseId: mbargaId,
          factureFournisseurId: facture.id,
          montant: 50000,
          moyenPaiement: "manuel",
          creeParId: utilisateurMbargaId,
        })
        .returning({ id: paiementEffectue.id });
      return [facture.id, paiement.id];
    });
    factureMbargaId = fM;
    paiementMbargaId = pM;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(paiementEffectue).where(eq(paiementEffectue.entrepriseId, id));
        await tx.delete(factureFournisseur).where(eq(factureFournisseur.entrepriseId, id));
        await tx.delete(fournisseur).where(eq(fournisseur.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas la facture fournisseur d'une autre, même en ciblant son id précis", async () => {
    const vusParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(factureFournisseur));
    expect(vusParKiro.some((f) => f.id === factureMbargaId)).toBe(false);

    const tentative = await avecEntreprise(kiroId, (tx) => tx.select().from(factureFournisseur).where(eq(factureFournisseur.id, factureMbargaId)));
    expect(tentative).toHaveLength(0);
  });

  test("une entreprise ne peut pas lire, modifier ni supprimer le paiement effectué d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(paiementEffectue).where(eq(paiementEffectue.id, paiementMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(paiementEffectue).set({ montant: 1 }).where(eq(paiementEffectue.id, paiementMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(paiementEffectue).where(eq(paiementEffectue.id, paiementMbargaId)));
    expect(reel.montant).not.toBe(1);

    await avecEntreprise(kiroId, (tx) => tx.delete(paiementEffectue).where(eq(paiementEffectue.id, paiementMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(paiementEffectue).where(eq(paiementEffectue.id, paiementMbargaId)));
    expect(toujoursLa).toBeDefined();
  });
});

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, fournisseur, bonCommandeAchat, avoirFournisseur, factureFournisseur, compteComptable } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour la
 * troisième tranche du cycle Achats (Bons de commande/Avoirs fournisseur,
 * échange du 2026-09-07) — voir CLAUDE.md : "après chaque nouveau module
 * touchant à des données d'entreprise, un test délibéré doit vérifier
 * qu'une entreprise fictive ne peut techniquement pas accéder aux données
 * d'une autre."
 */
describe("Achats — isolation RLS entre entreprises (bon_commande_achat/avoir_fournisseur)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let bcMbargaId: string;
  let avoirMbargaId: string;
  let compteChargeId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST BC Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST BC Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-bc-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-bc-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const [uneLigne] = await db.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.numero, "605000"));
    compteChargeId = uneLigne.id;

    const [bcM, avM] = await avecEntreprise(mbargaId, async (tx) => {
      const [f] = await tx
        .insert(fournisseur)
        .values({ entrepriseId: mbargaId, nom: "Fournisseur Mbarga", telephone: "+237600000053" })
        .returning({ id: fournisseur.id });
      const [bc] = await tx
        .insert(bonCommandeAchat)
        .values({
          entrepriseId: mbargaId,
          numero: "BC-MBARGA-0001",
          fournisseurId: f.id,
          compteComptableId: compteChargeId,
          montantHT: 30000,
          montantTVA: 0,
          montantTTC: 30000,
          assigneAId: utilisateurMbargaId,
          creeParId: utilisateurMbargaId,
        })
        .returning({ id: bonCommandeAchat.id });
      const [facture] = await tx
        .insert(factureFournisseur)
        .values({
          entrepriseId: mbargaId,
          numero: "FA-MBARGA-0002",
          fournisseurId: f.id,
          compteComptableId: compteChargeId,
          dateFacture: new Date(),
          dateEcheance: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
          montantHT: 30000,
          montantTVA: 0,
          montantTTC: 30000,
          assigneAId: utilisateurMbargaId,
          creeParId: utilisateurMbargaId,
        })
        .returning({ id: factureFournisseur.id });
      const [avoir] = await tx
        .insert(avoirFournisseur)
        .values({ entrepriseId: mbargaId, factureFournisseurId: facture.id, motif: "Retour marchandise" })
        .returning({ id: avoirFournisseur.id });
      return [bc.id, avoir.id];
    });
    bcMbargaId = bcM;
    avoirMbargaId = avM;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(avoirFournisseur).where(eq(avoirFournisseur.entrepriseId, id));
        await tx.delete(factureFournisseur).where(eq(factureFournisseur.entrepriseId, id));
        await tx.delete(bonCommandeAchat).where(eq(bonCommandeAchat.entrepriseId, id));
        await tx.delete(fournisseur).where(eq(fournisseur.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas le bon de commande d'une autre, même en ciblant son id précis", async () => {
    const vusParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(bonCommandeAchat));
    expect(vusParKiro.some((bc) => bc.id === bcMbargaId)).toBe(false);

    const tentative = await avecEntreprise(kiroId, (tx) => tx.select().from(bonCommandeAchat).where(eq(bonCommandeAchat.id, bcMbargaId)));
    expect(tentative).toHaveLength(0);
  });

  test("une entreprise ne peut pas lire, modifier ni supprimer l'avoir fournisseur d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(avoirFournisseur).where(eq(avoirFournisseur.id, avoirMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(avoirFournisseur).set({ motif: "Piraté depuis Kiro" }).where(eq(avoirFournisseur.id, avoirMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(avoirFournisseur).where(eq(avoirFournisseur.id, avoirMbargaId)));
    expect(reel.motif).not.toBe("Piraté depuis Kiro");

    await avecEntreprise(kiroId, (tx) => tx.delete(avoirFournisseur).where(eq(avoirFournisseur.id, avoirMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(avoirFournisseur).where(eq(avoirFournisseur.id, avoirMbargaId)));
    expect(toujoursLa).toBeDefined();
  });
});

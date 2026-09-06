import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, fournisseur, depense, compteComptable } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour le cycle
 * Achats (Fournisseurs/Dépenses, inspiré de Zoho Books, échange du
 * 2026-09-06) — voir CLAUDE.md : "après chaque nouveau module touchant à des
 * données d'entreprise, un test délibéré doit vérifier qu'une entreprise
 * fictive ne peut techniquement pas accéder aux données d'une autre."
 */
describe("Achats — isolation RLS entre entreprises (fournisseur/depense)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let fournisseurMbargaId: string;
  let depenseMbargaId: string;
  let compteChargeId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Achats Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Achats Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-achats-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-achats-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    // Référentiel SYSCOHADA global (hors RLS, voir schema.ts) — "Autres achats".
    const [uneLigne] = await db.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.numero, "605000"));
    compteChargeId = uneLigne.id;

    await avecEntreprise(kiroId, (tx) => tx.insert(fournisseur).values({ entrepriseId: kiroId, nom: "Fournisseur Kiro", telephone: "+237600000050" }));

    const [fM, dM] = await avecEntreprise(mbargaId, async (tx) => {
      const [f] = await tx
        .insert(fournisseur)
        .values({ entrepriseId: mbargaId, nom: "Fournisseur Mbarga", telephone: "+237600000051" })
        .returning({ id: fournisseur.id });
      const [d] = await tx
        .insert(depense)
        .values({
          entrepriseId: mbargaId,
          libelle: "Dépense Mbarga",
          compteComptableId: compteChargeId,
          fournisseurId: f.id,
          montantHT: 10000,
          montantTVA: 0,
          montantTTC: 10000,
          moyenPaiement: "manuel",
          datePaiement: new Date(),
          assigneAId: utilisateurMbargaId,
          creeParId: utilisateurMbargaId,
        })
        .returning({ id: depense.id });
      return [f.id, d.id];
    });
    fournisseurMbargaId = fM;
    depenseMbargaId = dM;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(depense).where(eq(depense.entrepriseId, id));
        await tx.delete(fournisseur).where(eq(fournisseur.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas les fournisseurs d'une autre, même en lecture large", async () => {
    const vusParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(fournisseur));
    expect(vusParKiro.some((f) => f.id === fournisseurMbargaId)).toBe(false);

    const tentative = await avecEntreprise(kiroId, (tx) => tx.select().from(fournisseur).where(eq(fournisseur.id, fournisseurMbargaId)));
    expect(tentative).toHaveLength(0);
  });

  test("une entreprise ne peut pas lire, modifier ni supprimer la dépense d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(depense).where(eq(depense.id, depenseMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(depense).set({ libelle: "Piraté depuis Kiro" }).where(eq(depense.id, depenseMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(depense).where(eq(depense.id, depenseMbargaId)));
    expect(reel.libelle).not.toBe("Piraté depuis Kiro");

    await avecEntreprise(kiroId, (tx) => tx.delete(depense).where(eq(depense.id, depenseMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(depense).where(eq(depense.id, depenseMbargaId)));
    expect(toujoursLa).toBeDefined();
  });
});

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, classeurDocumentFinancier, documentFinancier } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour le module
 * Documents financiers (inspiré de Zoho Books, échange du 2026-09-06) — voir
 * CLAUDE.md : "après chaque nouveau module touchant à des données
 * d'entreprise, un test délibéré doit vérifier qu'une entreprise fictive ne
 * peut techniquement pas accéder aux données d'une autre."
 */
describe("Comptabilité — isolation RLS entre entreprises (documents financiers)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let classeurMbargaId: string;
  let documentMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Docs Financiers Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Docs Financiers Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-docs-fin-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-docs-fin-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    await avecEntreprise(kiroId, (tx) =>
      tx.insert(documentFinancier).values({
        entrepriseId: kiroId,
        nom: "Reçu Kiro.pdf",
        cleStockage: `${kiroId}/test-recu-kiro.pdf`,
        typeMime: "application/pdf",
        tailleOctets: 1000,
        televerseParId: utilisateurKiroId,
      })
    );

    const [cM, dM] = await avecEntreprise(mbargaId, async (tx) => {
      const [classeur] = await tx
        .insert(classeurDocumentFinancier)
        .values({ entrepriseId: mbargaId, nom: "Classeur Mbarga", creeParId: utilisateurMbargaId })
        .returning({ id: classeurDocumentFinancier.id });
      const [doc] = await tx
        .insert(documentFinancier)
        .values({
          entrepriseId: mbargaId,
          nom: "Reçu Mbarga.pdf",
          cleStockage: `${mbargaId}/test-recu-mbarga.pdf`,
          typeMime: "application/pdf",
          tailleOctets: 2000,
          classeurId: classeur.id,
          televerseParId: utilisateurMbargaId,
        })
        .returning({ id: documentFinancier.id });
      return [classeur.id, doc.id];
    });
    classeurMbargaId = cM;
    documentMbargaId = dM;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(documentFinancier).where(eq(documentFinancier.entrepriseId, id));
        await tx.delete(classeurDocumentFinancier).where(eq(classeurDocumentFinancier.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas les classeurs d'une autre", async () => {
    const vusParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(classeurDocumentFinancier));
    expect(vusParKiro.some((c) => c.id === classeurMbargaId)).toBe(false);
  });

  test("une entreprise ne peut pas lire, modifier ni supprimer le document financier d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(documentFinancier).where(eq(documentFinancier.id, documentMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) =>
      tx.update(documentFinancier).set({ nom: "Piraté depuis Kiro" }).where(eq(documentFinancier.id, documentMbargaId))
    );
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(documentFinancier).where(eq(documentFinancier.id, documentMbargaId)));
    expect(reel.nom).not.toBe("Piraté depuis Kiro");

    await avecEntreprise(kiroId, (tx) => tx.delete(documentFinancier).where(eq(documentFinancier.id, documentMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(documentFinancier).where(eq(documentFinancier.id, documentMbargaId)));
    expect(toujoursLa).toBeDefined();
  });

  test("une entreprise ne voit pas les documents financiers d'une autre, même en lecture large", async () => {
    const vusParMbarga = await avecEntreprise(mbargaId, (tx) => tx.select().from(documentFinancier));
    expect(vusParMbarga.every((d) => d.nom !== "Reçu Kiro.pdf")).toBe(true);
  });
});

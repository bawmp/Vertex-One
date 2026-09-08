import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, dossierRH, documentRH } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour la table
 * ajoutée avec les fichiers RH (document_rh) — voir CLAUDE.md : "après
 * chaque nouveau module touchant à des données d'entreprise, un test
 * délibéré doit vérifier qu'une entreprise fictive ne peut techniquement
 * pas accéder aux données d'une autre."
 */
describe("Fichiers RH — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let documentMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Document RH Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Document RH Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-document-rh-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-document-rh-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    documentMbargaId = await avecEntreprise(mbargaId, async (tx) => {
      const [dossier] = await tx
        .insert(dossierRH)
        .values({ entrepriseId: mbargaId, utilisateurId: utilisateurMbargaId, poste: "Mécanicien", typeContrat: "CDI", dateEmbauche: new Date("2020-01-01") })
        .returning({ id: dossierRH.id });
      const [doc] = await tx
        .insert(documentRH)
        .values({ entrepriseId: mbargaId, dossierRHId: dossier.id, nom: "cni.pdf", cleStockage: `${mbargaId}/cni.pdf`, typeMime: "application/pdf", tailleOctets: 1024, televerseParId: utilisateurMbargaId })
        .returning({ id: documentRH.id });
      return doc.id;
    });
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(documentRH).where(eq(documentRH.entrepriseId, id));
        await tx.delete(dossierRH).where(eq(dossierRH.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas, ne peut pas modifier, ni supprimer le fichier RH d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(documentRH).where(eq(documentRH.id, documentMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(documentRH).set({ nom: "pirate.pdf" }).where(eq(documentRH.id, documentMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(documentRH).where(eq(documentRH.id, documentMbargaId)));
    expect(reel.nom).not.toBe("pirate.pdf");

    await avecEntreprise(kiroId, (tx) => tx.delete(documentRH).where(eq(documentRH.id, documentMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(documentRH).where(eq(documentRH.id, documentMbargaId)));
    expect(toujoursLa).toBeDefined();
  });
});

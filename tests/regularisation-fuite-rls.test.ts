import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, dossierRH, regularisationPointage } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour la table
 * ajoutée avec la régularisation de pointage (regularisation_pointage) —
 * voir CLAUDE.md : "après chaque nouveau module touchant à des données
 * d'entreprise, un test délibéré doit vérifier qu'une entreprise fictive
 * ne peut techniquement pas accéder aux données d'une autre."
 */
describe("Régularisation de pointage — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let regularisationMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Regularisation Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Regularisation Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-regularisation-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-regularisation-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const resultat = await avecEntreprise(mbargaId, async (tx) => {
      const [d] = await tx
        .insert(dossierRH)
        .values({ entrepriseId: mbargaId, utilisateurId: utilisateurMbargaId, poste: "Gérant", typeContrat: "CDI", dateEmbauche: new Date("2020-01-01") })
        .returning({ id: dossierRH.id });
      const [r] = await tx
        .insert(regularisationPointage)
        .values({ entrepriseId: mbargaId, dossierRHId: d.id, date: new Date("2026-09-01"), heureArriveeProposee: new Date("2026-09-01T08:00:00"), motif: "Oubli de pointage" })
        .returning({ id: regularisationPointage.id });
      return { regularisationId: r.id };
    });
    regularisationMbargaId = resultat.regularisationId;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(regularisationPointage).where(eq(regularisationPointage.entrepriseId, id));
        await tx.delete(dossierRH).where(eq(dossierRH.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas, ne peut pas modifier, ni supprimer la régularisation d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(regularisationPointage).where(eq(regularisationPointage.id, regularisationMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(regularisationPointage).set({ statut: "APPROUVEE" }).where(eq(regularisationPointage.id, regularisationMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(regularisationPointage).where(eq(regularisationPointage.id, regularisationMbargaId)));
    expect(reel.statut).toBe("EN_ATTENTE");

    await avecEntreprise(kiroId, (tx) => tx.delete(regularisationPointage).where(eq(regularisationPointage.id, regularisationMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(regularisationPointage).where(eq(regularisationPointage.id, regularisationMbargaId)));
    expect(toujoursLa).toBeDefined();
  });
});

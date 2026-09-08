import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, sondage, sondageQuestion, sondageReponse, sondageParticipation } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour les quatre
 * tables ajoutées avec les sondages d'engagement (sondage, sondage_question,
 * sondage_reponse, sondage_participation) — voir CLAUDE.md : "après chaque
 * nouveau module touchant à des données d'entreprise, un test délibéré doit
 * vérifier qu'une entreprise fictive ne peut techniquement pas accéder aux
 * données d'une autre."
 */
describe("Sondages d'engagement — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let sondageMbargaId: string;
  let questionMbargaId: string;
  let reponseMbargaId: string;
  let participationMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Sondage Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Sondage Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-sondage-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-sondage-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const resultat = await avecEntreprise(mbargaId, async (tx) => {
      const [s] = await tx.insert(sondage).values({ entrepriseId: mbargaId, titre: "Satisfaction Mbarga", statut: "OUVERT", creeParId: utilisateurMbargaId }).returning({ id: sondage.id });
      const [q] = await tx.insert(sondageQuestion).values({ entrepriseId: mbargaId, sondageId: s.id, ordre: 0, libelle: "Recommanderiez-vous ?", type: "NPS" }).returning({ id: sondageQuestion.id });
      const [r] = await tx.insert(sondageReponse).values({ entrepriseId: mbargaId, sondageId: s.id, questionId: q.id, valeur: "9" }).returning({ id: sondageReponse.id });
      const [p] = await tx
        .insert(sondageParticipation)
        .values({ entrepriseId: mbargaId, sondageId: s.id, utilisateurId: utilisateurMbargaId })
        .returning({ id: sondageParticipation.id });
      return { sondageId: s.id, questionId: q.id, reponseId: r.id, participationId: p.id };
    });
    sondageMbargaId = resultat.sondageId;
    questionMbargaId = resultat.questionId;
    reponseMbargaId = resultat.reponseId;
    participationMbargaId = resultat.participationId;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(sondageParticipation).where(eq(sondageParticipation.entrepriseId, id));
        await tx.delete(sondageReponse).where(eq(sondageReponse.entrepriseId, id));
        await tx.delete(sondageQuestion).where(eq(sondageQuestion.entrepriseId, id));
        await tx.delete(sondage).where(eq(sondage.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas, ne peut pas modifier, ni supprimer le sondage d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(sondage).where(eq(sondage.id, sondageMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(sondage).set({ titre: "pirate" }).where(eq(sondage.id, sondageMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(sondage).where(eq(sondage.id, sondageMbargaId)));
    expect(reel.titre).not.toBe("pirate");

    await avecEntreprise(kiroId, (tx) => tx.delete(sondage).where(eq(sondage.id, sondageMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(sondage).where(eq(sondage.id, sondageMbargaId)));
    expect(toujoursLa).toBeDefined();
  });

  test("une entreprise ne voit pas la question, la réponse, ni la participation d'une autre", async () => {
    const questions = await avecEntreprise(kiroId, (tx) => tx.select().from(sondageQuestion).where(eq(sondageQuestion.id, questionMbargaId)));
    expect(questions).toHaveLength(0);

    const reponses = await avecEntreprise(kiroId, (tx) => tx.select().from(sondageReponse).where(eq(sondageReponse.id, reponseMbargaId)));
    expect(reponses).toHaveLength(0);

    const participations = await avecEntreprise(kiroId, (tx) => tx.select().from(sondageParticipation).where(eq(sondageParticipation.id, participationMbargaId)));
    expect(participations).toHaveLength(0);
  });
});

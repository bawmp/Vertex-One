import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, sondage, sondageQuestion, sondageReponse, sondageParticipation } from "@/db/schema";
import { calculerResultatsQuestion, SEUIL_MIN_PARTICIPANTS_POUR_RESULTATS } from "@/lib/rh/sondage";

describe("Sondages d'engagement — calcul des résultats (fonction pure)", () => {
  test("eNPS = %Promoteurs (9-10) - %Détracteurs (0-6), jamais une simple moyenne", () => {
    // 2 promoteurs (9,10), 1 passif (7), 1 détracteur (3) sur 4 réponses.
    const resultat = calculerResultatsQuestion("NPS", ["9", "10", "7", "3"]);
    expect(resultat.type).toBe("NPS");
    if (resultat.type !== "NPS") throw new Error("type inattendu");
    // (2 promoteurs - 1 détracteur) / 4 = 25%.
    expect(resultat.scoreENPS).toBe(25);
    expect(resultat.nombreReponses).toBe(4);
  });

  test("eNPS = 100 quand tout le monde est promoteur, -100 quand tout le monde est détracteur", () => {
    expect((calculerResultatsQuestion("NPS", ["9", "10", "9"]) as { scoreENPS: number }).scoreENPS).toBe(100);
    expect((calculerResultatsQuestion("NPS", ["0", "1", "6"]) as { scoreENPS: number }).scoreENPS).toBe(-100);
  });

  test("ETOILES calcule une moyenne arrondie à une décimale", () => {
    const resultat = calculerResultatsQuestion("ETOILES", ["5", "4", "3"]);
    expect(resultat.type).toBe("ETOILES");
    if (resultat.type !== "ETOILES") throw new Error("type inattendu");
    expect(resultat.moyenne).toBe(4);
    expect(resultat.nombreReponses).toBe(3);
  });

  test("TEXTE renvoie les réponses telles quelles, jamais agrégées", () => {
    const resultat = calculerResultatsQuestion("TEXTE", ["Bonne ambiance", "Manque de formation"]);
    expect(resultat).toEqual({ type: "TEXTE", reponses: ["Bonne ambiance", "Manque de formation"] });
  });
});

/**
 * Anonymat structurel (échange du 2026-09-08) : vérifie contre une vraie
 * base que sondageReponse ne porte aucune colonne utilisateur (impossible
 * de relier une réponse à son auteur, pas seulement caché côté interface)
 * et que sondageParticipation empêche bien une double soumission.
 */
describe("Sondages d'engagement — anonymat et double soumission (base réelle)", () => {
  let entrepriseId: string;
  let adminId: string;
  let employeAId: string;
  let employeBId: string;
  let employeCId: string;
  let sondageId: string;
  let questionNpsId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Sondage Logique", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [admin] = await db.insert(utilisateur).values({ entrepriseId, email: "admin-sondage-logique@vertexone.test", nomComplet: "Admin", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [empA] = await db.insert(utilisateur).values({ entrepriseId, email: "employe-a-sondage-logique@vertexone.test", nomComplet: "Employé A", role: "EMPLOYE" }).returning({ id: utilisateur.id });
    const [empB] = await db.insert(utilisateur).values({ entrepriseId, email: "employe-b-sondage-logique@vertexone.test", nomComplet: "Employé B", role: "EMPLOYE" }).returning({ id: utilisateur.id });
    const [empC] = await db.insert(utilisateur).values({ entrepriseId, email: "employe-c-sondage-logique@vertexone.test", nomComplet: "Employé C", role: "EMPLOYE" }).returning({ id: utilisateur.id });
    adminId = admin.id;
    employeAId = empA.id;
    employeBId = empB.id;
    employeCId = empC.id;

    const resultat = await avecEntreprise(entrepriseId, async (tx) => {
      const [s] = await tx.insert(sondage).values({ entrepriseId, titre: "Satisfaction test", statut: "OUVERT", creeParId: adminId }).returning({ id: sondage.id });
      const [q] = await tx.insert(sondageQuestion).values({ entrepriseId, sondageId: s.id, ordre: 0, libelle: "Recommanderiez-vous ?", type: "NPS" }).returning({ id: sondageQuestion.id });
      return { sondageId: s.id, questionId: q.id };
    });
    sondageId = resultat.sondageId;
    questionNpsId = resultat.questionId;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(sondageParticipation).where(eq(sondageParticipation.entrepriseId, entrepriseId));
      await tx.delete(sondageReponse).where(eq(sondageReponse.entrepriseId, entrepriseId));
      await tx.delete(sondageQuestion).where(eq(sondageQuestion.entrepriseId, entrepriseId));
      await tx.delete(sondage).where(eq(sondage.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, adminId));
    await db.delete(utilisateur).where(eq(utilisateur.id, employeAId));
    await db.delete(utilisateur).where(eq(utilisateur.id, employeBId));
    await db.delete(utilisateur).where(eq(utilisateur.id, employeCId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("trois employés répondent : les réponses n'ont aucune colonne reliant à un utilisateur, la participation est distincte", async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      for (const [utilisateurId, valeur] of [
        [employeAId, "9"],
        [employeBId, "10"],
        [employeCId, "2"],
      ] as const) {
        await tx.insert(sondageReponse).values({ entrepriseId, sondageId, questionId: questionNpsId, valeur });
        await tx.insert(sondageParticipation).values({ entrepriseId, sondageId, utilisateurId });
      }
    });

    const reponses = await avecEntreprise(entrepriseId, (tx) => tx.select().from(sondageReponse).where(eq(sondageReponse.sondageId, sondageId)));
    expect(reponses).toHaveLength(3);
    // Vérifie structurellement qu'aucune colonne de sondageReponse ne
    // pourrait relier une ligne à un utilisateur.
    for (const reponse of reponses) {
      expect(Object.keys(reponse)).not.toContain("utilisateurId");
      expect(Object.values(reponse)).not.toContain(employeAId);
      expect(Object.values(reponse)).not.toContain(employeBId);
      expect(Object.values(reponse)).not.toContain(employeCId);
    }

    const resultat = calculerResultatsQuestion("NPS", reponses.map((r) => r.valeur));
    if (resultat.type !== "NPS") throw new Error("type inattendu");
    expect(resultat.nombreReponses).toBeGreaterThanOrEqual(SEUIL_MIN_PARTICIPANTS_POUR_RESULTATS);
    // 2 promoteurs (9,10), 1 détracteur (2) sur 3 = (2-1)/3 = 33%, arrondi.
    expect(resultat.scoreENPS).toBe(33);
  });

  test("une deuxième soumission du même employé est bloquée par la contrainte unique", async () => {
    const tentative = avecEntreprise(entrepriseId, (tx) => tx.insert(sondageParticipation).values({ entrepriseId, sondageId, utilisateurId: employeAId }));
    await expect(tentative).rejects.toThrow();

    const participations = await avecEntreprise(entrepriseId, (tx) =>
      tx.select().from(sondageParticipation).where(and(eq(sondageParticipation.sondageId, sondageId), eq(sondageParticipation.utilisateurId, employeAId)))
    );
    expect(participations).toHaveLength(1);
  });
});

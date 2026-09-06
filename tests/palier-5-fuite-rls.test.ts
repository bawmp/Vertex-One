import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, dossierRH, demandeConge, pointage, evaluation } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour les trois
 * tables ajoutées au Palier 5 (demande_conge, pointage, evaluation) — voir
 * CLAUDE.md : "après chaque nouveau module touchant à des données
 * d'entreprise, un test délibéré doit vérifier qu'une entreprise fictive ne
 * peut techniquement pas accéder aux données d'une autre."
 */
describe("Palier 5 — isolation RLS entre entreprises (congés/pointage/évaluations)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let dossierRHMbargaId: string;
  let demandeMbargaId: string;
  let pointageMbargaId: string;
  let evaluationMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST P5 Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST P5 Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-p5-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "employe-p5-mbarga@vertexone.test", nomComplet: "Employé Mbarga", role: "EMPLOYE" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const [dM, demM, poM, evM] = await avecEntreprise(mbargaId, async (tx) => {
      const [d] = await tx
        .insert(dossierRH)
        .values({ entrepriseId: mbargaId, utilisateurId: utilisateurMbargaId, poste: "Mécanicien", typeContrat: "CDI", dateEmbauche: new Date() })
        .returning({ id: dossierRH.id });
      const [dem] = await tx
        .insert(demandeConge)
        .values({ entrepriseId: mbargaId, dossierRHId: d.id, type: "CONGE_PAYE", dateDebut: new Date(), dateFin: new Date(), nombreJours: 2 })
        .returning({ id: demandeConge.id });
      const [po] = await tx
        .insert(pointage)
        .values({ entrepriseId: mbargaId, dossierRHId: d.id, date: new Date(), statut: "PRESENT" })
        .returning({ id: pointage.id });
      const [ev] = await tx
        .insert(evaluation)
        .values({ entrepriseId: mbargaId, dossierRHId: d.id, evaluateurId: utilisateurMbargaId, periode: "2026-S1", commentaire: "RAS" })
        .returning({ id: evaluation.id });

      return [d.id, dem.id, po.id, ev.id];
    });
    dossierRHMbargaId = dM;
    demandeMbargaId = demM;
    pointageMbargaId = poM;
    evaluationMbargaId = evM;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(evaluation).where(eq(evaluation.entrepriseId, id));
        await tx.delete(pointage).where(eq(pointage.entrepriseId, id));
        await tx.delete(demandeConge).where(eq(demandeConge.entrepriseId, id));
        await tx.delete(dossierRH).where(eq(dossierRH.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas le dossier RH ni la demande de congé d'une autre", async () => {
    const dossiers = await avecEntreprise(kiroId, (tx) => tx.select().from(dossierRH).where(eq(dossierRH.id, dossierRHMbargaId)));
    expect(dossiers).toHaveLength(0);

    const demandes = await avecEntreprise(kiroId, (tx) => tx.select().from(demandeConge).where(eq(demandeConge.id, demandeMbargaId)));
    expect(demandes).toHaveLength(0);
  });

  test("une entreprise ne peut pas lire, modifier ni supprimer le pointage d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(pointage).where(eq(pointage.id, pointageMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(pointage).set({ statut: "ABSENT" }).where(eq(pointage.id, pointageMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(pointage).where(eq(pointage.id, pointageMbargaId)));
    expect(reel.statut).not.toBe("ABSENT");

    await avecEntreprise(kiroId, (tx) => tx.delete(pointage).where(eq(pointage.id, pointageMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(pointage).where(eq(pointage.id, pointageMbargaId)));
    expect(toujoursLa).toBeDefined();
  });

  test("une entreprise ne voit pas l'évaluation d'une autre", async () => {
    const evaluations = await avecEntreprise(kiroId, (tx) => tx.select().from(evaluation).where(eq(evaluation.id, evaluationMbargaId)));
    expect(evaluations).toHaveLength(0);
  });
});

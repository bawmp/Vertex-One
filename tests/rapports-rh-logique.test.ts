import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import {
  entreprise,
  utilisateur,
  dossierRH,
  demandeConge,
  regularisationPointage,
  pointage,
  ticketRH,
  categorieTicketRH,
  sondage,
  sondageQuestion,
  sondageReponse,
  sondageParticipation,
} from "@/db/schema";
import { rapportPersonnel, rapportEquipe, rapportEntreprise } from "@/lib/rh/rapports";
import { debutJournee } from "@/lib/rh/pointage";

/**
 * Rapports RH consolidés (échange du 2026-09-12, comparaison avec Zoho
 * People — "Reports"). Vérifie l'agrégation sur une vraie base plutôt que
 * des fonctions pures : chaque rapport lit plusieurs tables construites
 * dans les tranches précédentes de ce module (congés, pointage, tickets,
 * sondages, salaire).
 */
describe("Rapports RH — agrégation", () => {
  let entrepriseId: string;
  let adminId: string;
  let employeAId: string;
  let employeBId: string;
  let dossierAId: string;
  let dossierBId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Rapports RH", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [admin] = await db.insert(utilisateur).values({ entrepriseId, email: "admin-rapports-rh@vertexone.test", nomComplet: "Admin", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [empA] = await db.insert(utilisateur).values({ entrepriseId, email: "employe-a-rapports-rh@vertexone.test", nomComplet: "Employé A", role: "EMPLOYE" }).returning({ id: utilisateur.id });
    const [empB] = await db.insert(utilisateur).values({ entrepriseId, email: "employe-b-rapports-rh@vertexone.test", nomComplet: "Employé B", role: "EMPLOYE" }).returning({ id: utilisateur.id });
    adminId = admin.id;
    employeAId = empA.id;
    employeBId = empB.id;

    await avecEntreprise(entrepriseId, async (tx) => {
      const [dA] = await tx
        .insert(dossierRH)
        .values({ entrepriseId, utilisateurId: employeAId, poste: "Support", typeContrat: "CDI", dateEmbauche: new Date("2024-01-01"), soldeConges: 12, salaireBase: 200_000 })
        .returning({ id: dossierRH.id });
      const [dB] = await tx
        .insert(dossierRH)
        .values({ entrepriseId, utilisateurId: employeBId, poste: "Vente", typeContrat: "CDD", dateEmbauche: new Date("2025-06-01"), soldeConges: 5, salaireBase: 150_000 })
        .returning({ id: dossierRH.id });
      dossierAId = dA.id;
      dossierBId = dB.id;

      // Congé payé approuvé cette année pour A.
      await tx.insert(demandeConge).values({
        entrepriseId,
        dossierRHId: dossierAId,
        type: "CONGE_PAYE",
        dateDebut: new Date(new Date().getFullYear(), 2, 1),
        dateFin: new Date(new Date().getFullYear(), 2, 3),
        nombreJours: 3,
        statut: "APPROUVEE",
      });
      // Une demande en attente pour B — doit compter dans le rapport équipe.
      await tx.insert(demandeConge).values({
        entrepriseId,
        dossierRHId: dossierBId,
        type: "CONGE_PAYE",
        dateDebut: new Date(),
        dateFin: new Date(),
        nombreJours: 1,
        statut: "EN_ATTENTE",
      });

      // Régularisation en attente pour A.
      await tx.insert(regularisationPointage).values({ entrepriseId, dossierRHId: dossierAId, date: new Date("2026-01-05"), heureArriveeProposee: new Date("2026-01-05T08:00:00"), motif: "Test" });

      // A a pointé aujourd'hui, B non.
      await tx.insert(pointage).values({ entrepriseId, dossierRHId: dossierAId, date: debutJournee(new Date()), heureArrivee: new Date(), statut: "PRESENT" });

      // Ticket ouvert pour A.
      const [cat] = await tx.insert(categorieTicketRH).values({ entrepriseId, nom: "Général", agentId: adminId }).returning({ id: categorieTicketRH.id });
      await tx.insert(ticketRH).values({ entrepriseId, categorieId: cat.id, demandeurId: employeAId, titre: "Question", assigneAId: adminId, statut: "OUVERT" });

      // Un sondage fermé avec une question NPS, 2 réponses sur 2 employés actifs.
      const [s] = await tx.insert(sondage).values({ entrepriseId, titre: "Satisfaction", statut: "FERME", creeParId: adminId }).returning({ id: sondage.id });
      const [q] = await tx.insert(sondageQuestion).values({ entrepriseId, sondageId: s.id, ordre: 0, libelle: "Recommanderiez-vous ?", type: "NPS" }).returning({ id: sondageQuestion.id });
      await tx.insert(sondageReponse).values([
        { entrepriseId, sondageId: s.id, questionId: q.id, valeur: "9" },
        { entrepriseId, sondageId: s.id, questionId: q.id, valeur: "10" },
      ]);
      await tx.insert(sondageParticipation).values([
        { entrepriseId, sondageId: s.id, utilisateurId: employeAId },
        { entrepriseId, sondageId: s.id, utilisateurId: employeBId },
      ]);
    });
  }, 60_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(sondageParticipation).where(eq(sondageParticipation.entrepriseId, entrepriseId));
      await tx.delete(sondageReponse).where(eq(sondageReponse.entrepriseId, entrepriseId));
      await tx.delete(sondageQuestion).where(eq(sondageQuestion.entrepriseId, entrepriseId));
      await tx.delete(sondage).where(eq(sondage.entrepriseId, entrepriseId));
      await tx.delete(ticketRH).where(eq(ticketRH.entrepriseId, entrepriseId));
      await tx.delete(categorieTicketRH).where(eq(categorieTicketRH.entrepriseId, entrepriseId));
      await tx.delete(pointage).where(eq(pointage.entrepriseId, entrepriseId));
      await tx.delete(regularisationPointage).where(eq(regularisationPointage.entrepriseId, entrepriseId));
      await tx.delete(demandeConge).where(eq(demandeConge.entrepriseId, entrepriseId));
      await tx.delete(dossierRH).where(eq(dossierRH.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, adminId));
    await db.delete(utilisateur).where(eq(utilisateur.id, employeAId));
    await db.delete(utilisateur).where(eq(utilisateur.id, employeBId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 60_000);

  test("rapportPersonnel agrège solde, congés pris cette année, régularisations et tickets pour un seul dossier", async () => {
    const rapport = await avecEntreprise(entrepriseId, (tx) => rapportPersonnel(tx, dossierAId));
    expect(rapport.soldeConges).toBe(12);
    expect(rapport.congesPrisAnnee).toBe(3);
    expect(rapport.regularisationsEnAttente).toBe(1);
    expect(rapport.ticketsOuverts).toBe(1);
  });

  test("rapportPersonnel pour un dossier sans activité renvoie des zéros", async () => {
    const rapport = await avecEntreprise(entrepriseId, (tx) => rapportPersonnel(tx, dossierBId));
    expect(rapport.soldeConges).toBe(5);
    expect(rapport.congesPrisAnnee).toBe(0);
    expect(rapport.regularisationsEnAttente).toBe(0);
    expect(rapport.ticketsOuverts).toBe(0);
  });

  test("rapportEquipe reflète la demande en attente de B et la présence du jour de A", async () => {
    const lignes = await avecEntreprise(entrepriseId, (tx) => rapportEquipe(tx, [dossierAId, dossierBId]));
    const ligneA = lignes.find((l) => l.dossierRHId === dossierAId)!;
    const ligneB = lignes.find((l) => l.dossierRHId === dossierBId)!;

    expect(ligneA.presentAujourdhui).toBe(true);
    expect(ligneA.demandesCongeEnAttente).toBe(0);
    expect(ligneB.presentAujourdhui).toBe(false);
    expect(ligneB.demandesCongeEnAttente).toBe(1);
  });

  test("rapportEntreprise agrège contrats, masse salariale, tickets et le dernier sondage fermé", async () => {
    const rapport = await avecEntreprise(entrepriseId, (tx) => rapportEntreprise(tx, entrepriseId));

    expect(rapport.dossiersActifs).toBe(2);
    expect(rapport.dossiersPartis).toBe(0);
    expect(rapport.repartitionContrats).toEqual({ CDI: 1, CDD: 1 });
    expect(rapport.masseSalariale).toBe(350_000);
    expect(rapport.ticketsParStatut).toEqual({ OUVERT: 1 });

    expect(rapport.dernierSondage).not.toBeNull();
    expect(rapport.dernierSondage!.titre).toBe("Satisfaction");
    expect(rapport.dernierSondage!.tauxParticipation).toBe(100); // 2 participations / 2 dossiers actifs
    expect(rapport.dernierSondage!.resultats).toHaveLength(1);
    expect(rapport.dernierSondage!.resultats[0]).toMatchObject({ type: "NPS", scoreENPS: 100, nombreReponses: 2 });
  });
});

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, dossierRH, regularisationPointage, pointage } from "@/db/schema";
import { approuverRegularisation, refuserRegularisation } from "@/lib/rh/regularisation";
import { debutJournee } from "@/lib/rh/pointage";

/**
 * Régularisation de pointage (échange du 2026-09-12) — vérifie que la
 * correction n'est appliquée à `pointage` qu'à l'approbation (jamais à la
 * demande), que seuls les champs effectivement proposés sont écrasés, et
 * qu'un refus ne touche jamais `pointage`.
 */
describe("Régularisation de pointage — logique métier", () => {
  let entrepriseId: string;
  let adminId: string;
  let employeId: string;
  let dossierRHId: string;
  const jour = debutJournee(new Date("2026-09-01"));

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Regularisation Logique", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [admin] = await db.insert(utilisateur).values({ entrepriseId, email: "admin-regularisation-logique@vertexone.test", nomComplet: "Admin", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [employe] = await db.insert(utilisateur).values({ entrepriseId, email: "employe-regularisation-logique@vertexone.test", nomComplet: "Employé", role: "EMPLOYE" }).returning({ id: utilisateur.id });
    adminId = admin.id;
    employeId = employe.id;

    dossierRHId = await avecEntreprise(entrepriseId, async (tx) => {
      const [d] = await tx.insert(dossierRH).values({ entrepriseId, utilisateurId: employeId, poste: "Support", typeContrat: "CDI", dateEmbauche: new Date("2024-01-01") }).returning({ id: dossierRH.id });
      return d.id;
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(regularisationPointage).where(eq(regularisationPointage.entrepriseId, entrepriseId));
      await tx.delete(pointage).where(eq(pointage.entrepriseId, entrepriseId));
      await tx.delete(dossierRH).where(eq(dossierRH.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, adminId));
    await db.delete(utilisateur).where(eq(utilisateur.id, employeId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("l'approbation crée la ligne de pointage si elle n'existait pas encore", async () => {
    const heureArrivee = new Date("2026-09-01T08:15:00");
    const regularisationId = await avecEntreprise(entrepriseId, async (tx) => {
      const [r] = await tx
        .insert(regularisationPointage)
        .values({ entrepriseId, dossierRHId, date: jour, heureArriveeProposee: heureArrivee, motif: "Badge défectueux" })
        .returning({ id: regularisationPointage.id });
      return r.id;
    });

    await avecEntreprise(entrepriseId, (tx) => approuverRegularisation(tx, regularisationId, adminId));

    const [demande] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(regularisationPointage).where(eq(regularisationPointage.id, regularisationId)));
    expect(demande.statut).toBe("APPROUVEE");
    expect(demande.approuveParId).toBe(adminId);

    const [lePointage] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(pointage).where(and(eq(pointage.dossierRHId, dossierRHId), eq(pointage.date, jour))));
    expect(lePointage.heureArrivee?.getTime()).toBe(heureArrivee.getTime());
    expect(lePointage.heureDepart).toBeNull();
    expect(lePointage.statut).toBe("PRESENT");
  });

  test("une régularisation qui ne propose que le départ n'écrase pas l'arrivée déjà enregistrée", async () => {
    const heureDepart = new Date("2026-09-01T17:30:00");
    const regularisationId = await avecEntreprise(entrepriseId, async (tx) => {
      const [r] = await tx
        .insert(regularisationPointage)
        .values({ entrepriseId, dossierRHId, date: jour, heureDepartProposee: heureDepart, motif: "Oubli de pointer le départ" })
        .returning({ id: regularisationPointage.id });
      return r.id;
    });

    await avecEntreprise(entrepriseId, (tx) => approuverRegularisation(tx, regularisationId, adminId));

    const [lePointage] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(pointage).where(and(eq(pointage.dossierRHId, dossierRHId), eq(pointage.date, jour))));
    // L'heure d'arrivée du test précédent doit être conservée, jamais écrasée.
    expect(lePointage.heureArrivee).not.toBeNull();
    expect(lePointage.heureDepart?.getTime()).toBe(heureDepart.getTime());
  });

  test("un refus ne modifie jamais la ligne de pointage", async () => {
    const heureArriveeAvant = (
      await avecEntreprise(entrepriseId, (tx) => tx.select().from(pointage).where(and(eq(pointage.dossierRHId, dossierRHId), eq(pointage.date, jour))))
    )[0].heureArrivee;

    const regularisationId = await avecEntreprise(entrepriseId, async (tx) => {
      const [r] = await tx
        .insert(regularisationPointage)
        .values({ entrepriseId, dossierRHId, date: jour, heureArriveeProposee: new Date("2026-09-01T06:00:00"), motif: "Tentative non justifiée" })
        .returning({ id: regularisationPointage.id });
      return r.id;
    });

    await avecEntreprise(entrepriseId, (tx) => refuserRegularisation(tx, regularisationId, adminId));

    const [demande] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(regularisationPointage).where(eq(regularisationPointage.id, regularisationId)));
    expect(demande.statut).toBe("REFUSEE");

    const [lePointage] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(pointage).where(and(eq(pointage.dossierRHId, dossierRHId), eq(pointage.date, jour))));
    expect(lePointage.heureArrivee?.getTime()).toBe(heureArriveeAvant?.getTime());
  });

  test("une demande déjà traitée ne peut pas être re-traitée", async () => {
    const regularisationId = await avecEntreprise(entrepriseId, async (tx) => {
      const [r] = await tx
        .insert(regularisationPointage)
        .values({ entrepriseId, dossierRHId, date: new Date("2026-09-02"), heureArriveeProposee: new Date("2026-09-02T08:00:00"), motif: "Test" })
        .returning({ id: regularisationPointage.id });
      return r.id;
    });

    await avecEntreprise(entrepriseId, (tx) => approuverRegularisation(tx, regularisationId, adminId));
    // Une seconde tentative de refus sur une demande déjà approuvée ne doit rien changer.
    await avecEntreprise(entrepriseId, (tx) => refuserRegularisation(tx, regularisationId, adminId));

    const [demande] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(regularisationPointage).where(eq(regularisationPointage.id, regularisationId)));
    expect(demande.statut).toBe("APPROUVEE");
  });
});

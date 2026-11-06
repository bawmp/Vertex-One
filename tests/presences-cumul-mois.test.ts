import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { demandeConge, dossierRH, entreprise, pointage, utilisateur } from "@/db/schema";
import { enregistrerPresence } from "@/lib/rh/presences";
import { chargerSemaine } from "@/lib/rh/presences-semaine";
import type { UtilisateurConnecte } from "@/lib/session";

vi.setConfig({ testTimeout: 150_000, hookTimeout: 150_000 });

/** Cumul du mois sur la feuille hebdomadaire : sert au contrôle des présences, retards et absences (paie), managers compris. */
describe("Fiche hebdomadaire — cumul du mois (base réelle)", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  let a = "";
  let b = "";
  let adminA = "";
  let managerA = "";
  let employeA = "";
  let employeB = "";
  let dossierManager = "";
  let dossierEmploye = "";
  const admin = (): UtilisateurConnecte => ({ entrepriseId: a, utilisateurId: adminA, role: "ADMIN" });

  beforeAll(async () => {
    const ent = async (nom: string, niu: string) => (await db.insert(entreprise).values({ nom, secteurProfil: "agence", niu }).returning({ id: entreprise.id }))[0].id;
    a = await ent(`TEST Cumul A ${suffixe}`, `M0120260${Math.floor(Math.random() * 90000 + 10000)}`);
    b = await ent(`TEST Cumul B ${suffixe}`, `M0120261${Math.floor(Math.random() * 90000 + 10000)}`);
    const user = async (ent: string, nom: string, role: "ADMIN" | "MANAGER" | "EMPLOYE") => (await db.insert(utilisateur).values({ entrepriseId: ent, email: `cumul-${nom}-${suffixe}@vertexone.test`, nomComplet: `TEST ${nom}`, role }).returning({ id: utilisateur.id }))[0].id;
    adminA = await user(a, "adminA", "ADMIN");
    managerA = await user(a, "managerA", "MANAGER");
    employeA = await user(a, "employeA", "EMPLOYE");
    employeB = await user(b, "employeB", "EMPLOYE");
    const dossier = (ent: string, uid: string) => avecEntreprise(ent, async (tx) => (await tx.insert(dossierRH).values({ entrepriseId: ent, utilisateurId: uid, poste: "Poste", typeContrat: "CDI", dateEmbauche: new Date("2024-01-01") }).returning({ id: dossierRH.id }))[0].id);
    dossierManager = await dossier(a, managerA);
    dossierEmploye = await dossier(a, employeA);
    await dossier(b, employeB);
  });

  afterAll(async () => {
    for (const e of [a, b]) {
      if (!e) continue;
      await avecEntreprise(e, async (tx) => {
        await tx.delete(demandeConge).where(eq(demandeConge.entrepriseId, e));
        await tx.delete(pointage).where(eq(pointage.entrepriseId, e));
        await tx.delete(dossierRH).where(eq(dossierRH.entrepriseId, e));
      });
    }
    await db.delete(utilisateur).where(inArray(utilisateur.id, [adminA, managerA, employeA, employeB].filter(Boolean)));
    await db.delete(entreprise).where(inArray(entreprise.id, [a, b].filter(Boolean)));
  });

  test("compte présences, retards, absences et congés du mois entier, pour un employé comme pour un manager, sans mêler les entreprises", async () => {
    // Septembre 2026 est entièrement écoulé : la semaine du 7 contient le jeudi 10 → semaine 2 de septembre.
    const saisir = async (dossier: string, date: string, statut: "PRESENT" | "RETARD" | "ABSENT") => expect(await enregistrerPresence(admin(), { entrepriseId: a, dossierRHId: dossier, date, statut })).toEqual({});
    await saisir(dossierEmploye, "2026-09-01", "PRESENT");
    await saisir(dossierEmploye, "2026-09-02", "PRESENT");
    await saisir(dossierEmploye, "2026-09-03", "RETARD");
    await saisir(dossierEmploye, "2026-09-04", "ABSENT");
    await saisir(dossierEmploye, "2026-09-28", "ABSENT"); // hors de la semaine affichée, mais dans le mois
    await saisir(dossierManager, "2026-09-08", "RETARD");
    await saisir(dossierManager, "2026-09-09", "RETARD");
    await avecEntreprise(a, (tx) => tx.insert(demandeConge).values({ entrepriseId: a, dossierRHId: dossierEmploye, type: "CONGE_PAYE", dateDebut: new Date("2026-09-14T00:00:00"), dateFin: new Date("2026-09-16T00:00:00"), nombreJours: 3, statut: "APPROUVEE" }));

    const fiche = await chargerSemaine(admin(), "2026-09-09");
    expect(fiche).not.toBeNull();
    expect(fiche!.jours[0]).toBe("2026-09-07");
    expect(fiche!.mois).toMatchObject({ debut: "2026-09-01", fin: "2026-09-30", joursEcoules: 30 });
    const lignes = fiche!.sections[0].lignes;
    expect(lignes).toHaveLength(2); // le manager figure sur la feuille comme l'employé ; rien de l'entreprise B
    const e = lignes.find((l) => l.dossierRHId === dossierEmploye)!;
    const m = lignes.find((l) => l.dossierRHId === dossierManager)!;
    expect(e.cumul).toEqual({ presents: 2, retards: 1, absents: 2, conges: 3, nonRenseignes: 30 - 8 });
    expect(m.cumul).toMatchObject({ presents: 0, retards: 2, absents: 0, conges: 0 });
    expect(m.cellules[1].statut).toBe("RETARD"); // mardi 8
    expect(e.presents + e.retards + e.absents + e.conges).toBe(0); // la semaine du 7 n'a aucune saisie de l'employé
  });
});

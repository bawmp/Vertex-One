import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { gabaritMissionConfiee } from "@/lib/rh/missions-email";
import { db, avecEntreprise } from "@/db/client";
import { dossierRH, entreprise, mission, utilisateur } from "@/db/schema";
import { ajouterUnMois, etatMission, finDeMission, joursRestants, validerMission, validerSuivi, type SaisieMission } from "@/lib/rh/missions-regles";
import { creerMission, gererMission, lireMissions, personnesAssignables, suivreMission } from "@/lib/rh/missions";
import type { UtilisateurConnecte } from "@/lib/session";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Missions : hebdomadaires, mensuelles, de longue durée ou permanentes, confiées par l'Administrateur ou le manager, suivies par la personne. */
const AUJOURDHUI = "2026-11-22";
const base: SaisieMission = { titre: "Signer 5 nouveaux clients", description: "", resultatAttendu: "5 contrats", horizon: "MENSUELLE", dateDebut: AUJOURDHUI, dateFin: "" };

describe("Missions — règles pures", () => {
  test("fin selon la durée : semaine = 7 jours, mois = veille du même quantième, longue durée = date saisie, permanente = aucune", () => {
    expect(finDeMission("HEBDOMADAIRE", "2026-11-23", null)).toBe("2026-11-29");
    expect(finDeMission("MENSUELLE", "2026-11-01", null)).toBe("2026-11-30");
    expect(finDeMission("MENSUELLE", "2026-11-22", null)).toBe("2026-12-21");
    expect(finDeMission("MENSUELLE", "2026-01-31", null)).toBe("2026-02-27"); // le 31 janvier donne fin février, jamais un débordement
    expect(finDeMission("LONGUE_DUREE", "2026-11-22", "2027-06-30")).toBe("2027-06-30");
    expect(finDeMission("PERMANENTE", "2026-11-22", "2027-06-30")).toBeNull();
    expect(ajouterUnMois("2028-01-31")).toBe("2028-02-29");
  });

  test("validation : titre, durée connue, début réel, fin obligatoire et cohérente pour la longue durée", () => {
    const ok = validerMission({ ...base, titre: "  Signer   5 clients " }, AUJOURDHUI);
    expect(ok).toMatchObject({ ok: true, valeurs: { titre: "Signer 5 clients", horizon: "MENSUELLE", dateFin: "2026-12-21", description: null } });
    expect(validerMission({ ...base, titre: "ab" }, AUJOURDHUI).ok).toBe(false);
    expect(validerMission({ ...base, horizon: "TRIMESTRIELLE" }, AUJOURDHUI).ok).toBe(false);
    expect(validerMission({ ...base, dateDebut: "2026-02-31" }, AUJOURDHUI).ok).toBe(false);
    expect(validerMission({ ...base, dateDebut: "2026-09-01" }, AUJOURDHUI).ok).toBe(false); // commencée il y a plus d'un mois
    expect(validerMission({ ...base, dateDebut: "2028-01-01" }, AUJOURDHUI).ok).toBe(false); // démarre dans plus d'un an
    expect(validerMission({ ...base, horizon: "LONGUE_DUREE", dateFin: "" }, AUJOURDHUI).ok).toBe(false);
    expect(validerMission({ ...base, horizon: "LONGUE_DUREE", dateFin: "2026-11-01" }, AUJOURDHUI).ok).toBe(false);
    expect(validerMission({ ...base, horizon: "LONGUE_DUREE", dateFin: "2031-01-01" }, AUJOURDHUI).ok).toBe(false);
    expect(validerMission({ ...base, horizon: "LONGUE_DUREE", dateFin: "2027-05-01" }, AUJOURDHUI)).toMatchObject({ ok: true, valeurs: { dateFin: "2027-05-01" } });
    expect(validerMission({ ...base, horizon: "PERMANENTE" }, AUJOURDHUI)).toMatchObject({ ok: true, valeurs: { dateFin: null } });
  });

  test("suivi : avancement entier de 0 à 100, point de suivi borné ; état affiché selon les dates", () => {
    expect(validerSuivi(40, " en bonne voie ")).toEqual({ ok: true, avancement: 40, note: "en bonne voie" });
    expect(validerSuivi("100", "").ok).toBe(true);
    for (const mauvais of [-1, 101, 12.5, "abc", NaN]) expect(validerSuivi(mauvais, "").ok).toBe(false);
    expect(validerSuivi(10, "x".repeat(601)).ok).toBe(false);

    const periode = { dateDebut: "2026-11-16", dateFin: "2026-11-22" };
    expect(etatMission({ statut: "EN_COURS", ...periode }, "2026-11-22")).toBe("EN_COURS");
    expect(etatMission({ statut: "EN_COURS", ...periode }, "2026-11-23")).toBe("EN_RETARD");
    expect(etatMission({ statut: "EN_COURS", ...periode }, "2026-11-10")).toBe("A_VENIR");
    expect(etatMission({ statut: "TERMINEE", ...periode }, "2026-12-30")).toBe("TERMINEE");
    expect(etatMission({ statut: "ANNULEE", ...periode }, "2026-11-20")).toBe("ANNULEE");
    expect(etatMission({ statut: "EN_COURS", dateDebut: "2026-01-01", dateFin: null }, "2026-11-22")).toBe("EN_COURS"); // permanente : jamais en retard
    expect(joursRestants("2026-11-25", "2026-11-22")).toBe(3);
    expect(joursRestants("2026-11-20", "2026-11-22")).toBe(-2);
    expect(joursRestants(null, "2026-11-22")).toBeNull();
  });
});

describe("Missions — email", () => {
  test("le message annonce la mission et échappe tout ce qui a été saisi", () => {
    const v = validerMission({ ...base, titre: "Signer <b>5</b> clients", description: "<script>alert(1)</script>", horizon: "LONGUE_DUREE", dateFin: "2027-03-31" }, AUJOURDHUI);
    if (!v.ok) throw new Error("saisie valide attendue");
    const { sujet, html } = gabaritMissionConfiee({ nomPersonne: "Awa <i>", confieePar: "Le Directeur", entreprise: "TEST SA", mission: v.valeurs, lien: "https://exemple.test/app/rh/missions" });
    expect(sujet).toContain("de longue durée");
    expect(html).toContain("Le Directeur vous a confié une mission de longue durée chez TEST SA");
    expect(html).toContain("du 22 novembre 2026 au 31 mars 2027");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>5</b>");
    expect(html).toContain("&lt;b&gt;5&lt;/b&gt;");
    expect(html).toContain('href="https://exemple.test/app/rh/missions"');
  });
});

describe("Missions — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Missions A ${suffixe}`;
  const nomB = `TEST Missions B ${suffixe}`;
  const ent: Record<string, string> = {};
  const id: Record<string, string> = {};
  const sess = (cle: string, role: "ADMIN" | "MANAGER" | "EMPLOYE", e: string) => ({ utilisateurId: id[cle], entrepriseId: ent[e], role, modulesAutorises: null }) as unknown as UtilisateurConnecte;

  beforeAll(async () => {
    for (const [cle, nom] of [["A", nomA], ["B", nomB]] as const) {
      const [e] = await db.insert(entreprise).values({ nom, secteurProfil: "agence" }).returning({ id: entreprise.id });
      ent[cle] = e.id;
    }
    const personne = async (cle: string, e: string, role: "ADMIN" | "MANAGER" | "EMPLOYE", managerId?: string) => {
      const [x] = await db.insert(utilisateur).values({ entrepriseId: ent[e], email: `mi-${cle}-${suffixe}@vertexone.test`, nomComplet: `Personne ${cle}`, role, managerId: managerId ?? null }).returning({ id: utilisateur.id });
      id[cle] = x.id;
      await avecEntreprise(ent[e], (tx) => tx.insert(dossierRH).values({ entrepriseId: ent[e], utilisateurId: x.id, poste: "Poste", typeContrat: "CDI", dateEmbauche: new Date("2024-03-01") }));
    };
    await personne("adminA", "A", "ADMIN");
    await personne("managerA", "A", "MANAGER");
    await personne("autreManagerA", "A", "MANAGER");
    await personne("employeA", "A", "EMPLOYE", id.managerA); // dans l'équipe de managerA
    await personne("collegueA", "A", "EMPLOYE", id.autreManagerA); // dans l'équipe d'un autre manager
    await personne("adminB", "B", "ADMIN");
    await personne("employeB", "B", "EMPLOYE");
  }, 180_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const creer = (u: UtilisateurConnecte, cible: string, saisie: SaisieMission = base) => avecEntreprise(u.entrepriseId, (tx) => creerMission(tx, u, cible, saisie, AUJOURDHUI));
  const lire = (u: UtilisateurConnecte) => avecEntreprise(u.entrepriseId, (tx) => lireMissions(tx, u));
  let missionEmploye = "";
  let missionPermanente = "";

  test("l'Administrateur et le manager de la personne confient des missions de chaque durée ; la personne les voit", async () => {
    const premiere = await creer(sess("adminA", "ADMIN", "A"), id.employeA, { ...base, titre: "Rapport hebdomadaire des ventes", horizon: "HEBDOMADAIRE" });
    expect(premiere.ok).toBe(true);
    // l'email est préparé pour la personne (adresse relue en base) ; aucun email quand on se confie la mission à soi-même
    expect(premiere.ok && premiere.email).toMatchObject({ to: `mi-employeA-${suffixe}@vertexone.test` });
    const alAdmin = await creer(sess("adminA", "ADMIN", "A"), id.adminA, { ...base, titre: "Bilan trimestriel", horizon: "PERMANENTE" });
    expect(alAdmin.ok && alAdmin.email).toBeNull();
    expect((await creer(sess("managerA", "MANAGER", "A"), id.employeA, base)).ok).toBe(true);
    expect((await creer(sess("managerA", "MANAGER", "A"), id.employeA, { ...base, titre: "Refondre le catalogue", horizon: "LONGUE_DUREE", dateFin: "2027-03-31" })).ok).toBe(true);
    expect((await creer(sess("adminA", "ADMIN", "A"), id.employeA, { ...base, titre: "Répondre aux clients sous 24 h", horizon: "PERMANENTE" })).ok).toBe(true);
    const siennes = await lire(sess("employeA", "EMPLOYE", "A"));
    expect(siennes.map((x) => x.horizon).sort()).toEqual(["HEBDOMADAIRE", "LONGUE_DUREE", "MENSUELLE", "PERMANENTE"]);
    expect(siennes.find((x) => x.horizon === "PERMANENTE")?.dateFin).toBeNull();
    missionEmploye = siennes.find((x) => x.horizon === "MENSUELLE")!.id;
    missionPermanente = siennes.find((x) => x.horizon === "PERMANENTE")!.id;
  }, 180_000);

  test("refusé : la personne elle-même, un manager hors équipe, un manager sur lui-même ; jamais de client ni de personne d'une autre entreprise", async () => {
    expect((await creer(sess("employeA", "EMPLOYE", "A"), id.employeA)).ok).toBe(false);
    expect((await creer(sess("managerA", "MANAGER", "A"), id.collegueA)).ok).toBe(false);
    expect((await creer(sess("managerA", "MANAGER", "A"), id.managerA)).ok).toBe(false);
    expect((await creer(sess("adminA", "ADMIN", "A"), id.employeB)).ok).toBe(false); // cible d'une autre entreprise
    expect((await avecEntreprise(ent.A, (tx) => personnesAssignables(tx, sess("employeA", "EMPLOYE", "A")))).length).toBe(0);
    const duManager = await avecEntreprise(ent.A, (tx) => personnesAssignables(tx, sess("managerA", "MANAGER", "A")));
    expect(duManager.map((p) => p.id)).toEqual([id.employeA]); // son équipe, sans lui-même ni le collègue d'un autre manager
  }, 120_000);

  test("portée de lecture : un manager ne voit que son équipe, l'Administrateur voit tout, un collègue rien", async () => {
    expect((await lire(sess("managerA", "MANAGER", "A"))).length).toBe(4);
    expect((await lire(sess("autreManagerA", "MANAGER", "A"))).length).toBe(0);
    expect((await lire(sess("collegueA", "EMPLOYE", "A"))).length).toBe(0);
    expect((await lire(sess("adminA", "ADMIN", "A"))).length).toBe(5); // dont celle que l'Administrateur s'est confiée
  }, 120_000);

  test("suivi : la personne met à jour et termine ; un collègue non ; une permanente ne se termine pas ; une mission terminée ne se suit plus", async () => {
    const suivre = (u: UtilisateurConnecte, mid: string, avancement: unknown, note: string, terminer: boolean) => avecEntreprise(u.entrepriseId, (tx) => suivreMission(tx, u, mid, { avancement, note, terminer }));
    expect((await suivre(sess("collegueA", "EMPLOYE", "A"), missionEmploye, 50, "", false)).ok).toBe(false);
    expect((await suivre(sess("employeA", "EMPLOYE", "A"), missionEmploye, 150, "", false)).ok).toBe(false);
    expect((await suivre(sess("employeA", "EMPLOYE", "A"), missionEmploye, 60, "3 contrats signés", false)).ok).toBe(true);
    const apres = (await lire(sess("employeA", "EMPLOYE", "A"))).find((x) => x.id === missionEmploye)!;
    expect(apres).toMatchObject({ avancement: 60, noteSuivi: "3 contrats signés", statut: "EN_COURS" });
    expect(apres.suiviLe).not.toBeNull();

    expect((await suivre(sess("employeA", "EMPLOYE", "A"), missionPermanente, 0, "RAS", true)).ok).toBe(false);
    expect((await suivre(sess("employeA", "EMPLOYE", "A"), missionPermanente, 0, "Point du lundi : RAS", false)).ok).toBe(true);

    expect((await suivre(sess("employeA", "EMPLOYE", "A"), missionEmploye, 100, "Terminé", true)).ok).toBe(true);
    const close = (await lire(sess("employeA", "EMPLOYE", "A"))).find((x) => x.id === missionEmploye)!;
    expect(close).toMatchObject({ statut: "TERMINEE", avancement: 100 });
    expect(close.termineeLe).not.toBeNull();
    expect((await suivre(sess("employeA", "EMPLOYE", "A"), missionEmploye, 10, "", false)).ok).toBe(false);
  }, 180_000);

  test("annuler, rouvrir, supprimer : à qui gère la personne seulement", async () => {
    const gerer = (u: UtilisateurConnecte, mid: string, a: "ANNULER" | "ROUVRIR" | "SUPPRIMER") => avecEntreprise(u.entrepriseId, (tx) => gererMission(tx, u, mid, a));
    expect((await gerer(sess("employeA", "EMPLOYE", "A"), missionPermanente, "ANNULER")).ok).toBe(false);
    expect((await gerer(sess("autreManagerA", "MANAGER", "A"), missionPermanente, "ANNULER")).ok).toBe(false);
    expect((await gerer(sess("managerA", "MANAGER", "A"), missionPermanente, "ANNULER")).ok).toBe(true);
    expect((await lire(sess("employeA", "EMPLOYE", "A"))).find((x) => x.id === missionPermanente)?.statut).toBe("ANNULEE");
    expect((await gerer(sess("managerA", "MANAGER", "A"), missionPermanente, "ROUVRIR")).ok).toBe(true);
    expect((await lire(sess("employeA", "EMPLOYE", "A"))).find((x) => x.id === missionPermanente)?.statut).toBe("EN_COURS");
    expect((await gerer(sess("employeA", "EMPLOYE", "A"), missionEmploye, "SUPPRIMER")).ok).toBe(false);
    expect((await gerer(sess("adminA", "ADMIN", "A"), missionEmploye, "SUPPRIMER")).ok).toBe(true);
    expect((await lire(sess("adminA", "ADMIN", "A"))).length).toBe(4);
  }, 180_000);

  test("fuite : l'autre entreprise ne voit ni ne touche aucune mission, et la base les masque", async () => {
    expect((await lire(sess("adminB", "ADMIN", "B"))).length).toBe(0);
    const adminB = sess("adminB", "ADMIN", "B");
    expect((await avecEntreprise(ent.B, (tx) => gererMission(tx, adminB, missionPermanente, "SUPPRIMER"))).ok).toBe(false);
    expect((await avecEntreprise(ent.B, (tx) => suivreMission(tx, adminB, missionPermanente, { avancement: 0, note: "intrus", terminer: false }))).ok).toBe(false);
    expect(await avecEntreprise(ent.B, (tx) => tx.select({ id: mission.id }).from(mission))).toHaveLength(0);
    expect((await avecEntreprise(ent.A, (tx) => tx.select({ id: mission.id }).from(mission))).length).toBe(4);
  }, 120_000);
});

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { dossierRH, entreprise, mission, utilisateur } from "@/db/schema";
import { definirReconduction, lireMissions, renouvelerMissions, suivreMission } from "@/lib/rh/missions";
import { gabaritMissionsRenouvelees } from "@/lib/rh/missions-email";
import { etatMission, peutSeRenouveler, prochainePeriode, validerMission } from "@/lib/rh/missions-regles";
import type { UtilisateurConnecte } from "@/lib/session";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Renouvellement automatique des missions de la semaine et du mois : la période finie est close, la suivante naît toute seule, jamais deux fois. */
const AUJOURDHUI = "2026-11-30"; // un lundi : la semaine du 23 au 29 novembre vient de finir

describe("Renouvellement — règles pures", () => {
  test("période suivante : lendemain de la fin ; semaines et mois ; saut si le worker est resté arrêté ; rien pour les autres durées", () => {
    expect(prochainePeriode("HEBDOMADAIRE", "2026-11-29", AUJOURDHUI)).toEqual({ dateDebut: "2026-11-30", dateFin: "2026-12-06" });
    expect(prochainePeriode("MENSUELLE", "2026-12-21", "2026-12-22")).toEqual({ dateDebut: "2026-12-22", dateFin: "2027-01-21" });
    // Worker arrêté trois semaines : on saute jusqu'à la période qui contient aujourd'hui (jamais de semaines mortes recréées).
    expect(prochainePeriode("HEBDOMADAIRE", "2026-11-15", "2026-12-02")).toEqual({ dateDebut: "2026-11-30", dateFin: "2026-12-06" });
    expect(prochainePeriode("LONGUE_DUREE", "2026-11-29", AUJOURDHUI)).toBeNull();
    expect(prochainePeriode("PERMANENTE", null, AUJOURDHUI)).toBeNull();
    expect(prochainePeriode("HEBDOMADAIRE", null, AUJOURDHUI)).toBeNull();
    expect(peutSeRenouveler("HEBDOMADAIRE")).toBe(true);
    expect(peutSeRenouveler("MENSUELLE")).toBe(true);
    expect(peutSeRenouveler("LONGUE_DUREE")).toBe(false);
  });

  test("la case « renouveler » ne compte que pour une mission de la semaine ou du mois ; une période close reste visible comme telle", () => {
    const base = { titre: "Ventes de la semaine", description: "", resultatAttendu: "3 ventes", dateDebut: AUJOURDHUI, dateFin: "" };
    expect(validerMission({ ...base, horizon: "HEBDOMADAIRE", reconduction: "on" }, AUJOURDHUI)).toMatchObject({ ok: true, valeurs: { reconduction: true } });
    expect(validerMission({ ...base, horizon: "HEBDOMADAIRE" }, AUJOURDHUI)).toMatchObject({ ok: true, valeurs: { reconduction: false } });
    expect(validerMission({ ...base, horizon: "PERMANENTE", reconduction: "on" }, AUJOURDHUI)).toMatchObject({ ok: true, valeurs: { reconduction: false } });
    expect(validerMission({ ...base, horizon: "LONGUE_DUREE", dateFin: "2027-02-01", reconduction: "on" }, AUJOURDHUI)).toMatchObject({ ok: true, valeurs: { reconduction: false } });
    expect(etatMission({ statut: "CLOTUREE", dateDebut: "2026-11-23", dateFin: "2026-11-29" }, AUJOURDHUI)).toBe("CLOTUREE");
  });

  test("email : un seul message par personne, échappé", () => {
    const { sujet, html } = gabaritMissionsRenouvelees({
      nomPersonne: "Awa <b>",
      missions: [
        { titre: "Ventes <i>Vertex</i>", resultatAttendu: "3 ventes <script>x</script>", dateDebut: "2026-11-30", dateFin: "2026-12-06" },
        { titre: "Prospects", resultatAttendu: null, dateDebut: "2026-11-30", dateFin: "2026-12-06" },
      ],
      lien: "https://exemple.test/app/rh/missions",
    });
    expect(sujet).toBe("2 missions renouvelées pour la nouvelle période");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;i&gt;Vertex&lt;/i&gt;");
    expect(gabaritMissionsRenouvelees({ nomPersonne: "Awa", missions: [{ titre: "Ventes", resultatAttendu: null, dateDebut: "2026-11-30", dateFin: "2026-12-06" }], lien: "https://x.test" }).sujet).toBe("Mission renouvelée : Ventes");
  });
});

describe("Renouvellement — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const noms = { A: `TEST Renouv A ${suffixe}`, B: `TEST Renouv B ${suffixe}` };
  const ent: Record<string, string> = {};
  const id: Record<string, string> = {};
  const sess = (cle: string, role: "ADMIN" | "MANAGER" | "EMPLOYE", e: string) => ({ utilisateurId: id[cle], entrepriseId: ent[e], role, modulesAutorises: null }) as unknown as UtilisateurConnecte;
  const m: Record<string, string> = {};

  beforeAll(async () => {
    for (const [cle, nom] of Object.entries(noms)) {
      const [e] = await db.insert(entreprise).values({ nom, secteurProfil: "agence" }).returning({ id: entreprise.id });
      ent[cle] = e.id;
    }
    const personne = async (cle: string, e: string, role: "ADMIN" | "MANAGER" | "EMPLOYE", statut: "ACTIF" | "DESACTIVE" = "ACTIF", managerId?: string) => {
      const [x] = await db.insert(utilisateur).values({ entrepriseId: ent[e], email: `rn-${cle}-${suffixe}@vertexone.test`, nomComplet: `Personne ${cle}`, role, statut, managerId: managerId ?? null }).returning({ id: utilisateur.id });
      id[cle] = x.id;
      await avecEntreprise(ent[e], (tx) => tx.insert(dossierRH).values({ entrepriseId: ent[e], utilisateurId: x.id, poste: "Poste", typeContrat: "CDI", dateEmbauche: new Date("2024-03-01") }));
    };
    await personne("adminA", "A", "ADMIN");
    await personne("managerA", "A", "MANAGER");
    await personne("autreManagerA", "A", "MANAGER");
    await personne("awa", "A", "EMPLOYE", "ACTIF", id.managerA);
    await personne("parti", "A", "EMPLOYE", "DESACTIVE");
    await personne("adminB", "B", "ADMIN");

    const base = { entrepriseId: ent.A, utilisateurId: id.awa, creeParId: id.managerA, reconduction: true };
    const periodeFinie = { dateDebut: "2026-11-23", dateFin: "2026-11-29" };
    const lignes = [
      ["enCours", { ...base, ...periodeFinie, titre: "Ventes de la semaine", horizon: "HEBDOMADAIRE", resultatAttendu: "3 ventes", avancement: 60, noteSuivi: "3 en négociation" }],
      ["terminee", { ...base, ...periodeFinie, titre: "Prospection", horizon: "HEBDOMADAIRE", statut: "TERMINEE", avancement: 100 }],
      ["mensuelle", { ...base, titre: "Chiffre du mois", horizon: "MENSUELLE", dateDebut: "2026-10-30", dateFin: "2026-11-29", avancement: 20 }],
      ["sansRenouvellement", { ...base, ...periodeFinie, titre: "Sans suite", horizon: "HEBDOMADAIRE", reconduction: false }],
      ["annulee", { ...base, ...periodeFinie, titre: "Annulée", horizon: "HEBDOMADAIRE", statut: "ANNULEE" }],
      ["parti", { ...base, utilisateurId: id.parti, ...periodeFinie, titre: "Personne partie", horizon: "HEBDOMADAIRE" }],
      ["longue", { ...base, titre: "Longue durée", horizon: "LONGUE_DUREE", dateDebut: "2026-09-01", dateFin: "2026-11-29" }],
      ["pasFinie", { ...base, titre: "Pas encore finie", horizon: "HEBDOMADAIRE", dateDebut: "2026-11-30", dateFin: "2026-12-06" }],
      ["rattrapage", { ...base, titre: "Worker arrêté", horizon: "HEBDOMADAIRE", dateDebut: "2026-11-02", dateFin: "2026-11-08" }],
    ] as const;
    for (const [cle, valeurs] of lignes) {
      const [x] = await avecEntreprise(ent.A, (tx) => tx.insert(mission).values(valeurs as typeof mission.$inferInsert).returning({ id: mission.id }));
      m[cle] = x.id;
    }
  }, 240_000);

  afterAll(async () => {
    for (const nom of Object.values(noms)) await supprimerEntrepriseDeTest(nom);
  }, 300_000);

  const lire = (cle: string) => avecEntreprise(ent.A, async (tx) => (await tx.select().from(mission).where(eq(mission.id, m[cle])))[0]);
  const toutes = () => avecEntreprise(ent.A, (tx) => tx.select().from(mission).where(eq(mission.entrepriseId, ent.A)));

  test("renouvelle les missions finies : période close avec son avancement, suivante à zéro, un seul email par personne ; ignore annulées, sans renouvellement, personnes parties, longue durée, périodes en cours", async () => {
    const avant = (await toutes()).length;
    const r = await avecEntreprise(ent.A, (tx) => renouvelerMissions(tx, ent.A, AUJOURDHUI));
    // enCours, terminee, mensuelle, rattrapage
    expect(r.renouvelees).toBe(4);
    expect(r.courriers).toHaveLength(1);
    expect(r.courriers[0].to).toBe(`rn-awa-${suffixe}@vertexone.test`);
    expect(r.courriers[0].sujet).toBe("4 missions renouvelées pour la nouvelle période");
    expect((await toutes()).length).toBe(avant + 4);

    // La période finie est close mais garde son résultat ; une mission déjà terminée reste terminée.
    expect(await lire("enCours")).toMatchObject({ statut: "CLOTUREE", avancement: 60, noteSuivi: "3 en négociation" });
    expect((await lire("enCours")).suivanteCreeeLe).not.toBeNull();
    expect(await lire("terminee")).toMatchObject({ statut: "TERMINEE", avancement: 100 });

    // La suivante : même texte, même personne, même auteur, avancement à zéro, période suivante.
    const suivantes = await avecEntreprise(ent.A, (tx) => tx.select().from(mission).where(and(eq(mission.entrepriseId, ent.A), eq(mission.precedenteId, m.enCours))));
    expect(suivantes).toHaveLength(1);
    expect(suivantes[0]).toMatchObject({ titre: "Ventes de la semaine", resultatAttendu: "3 ventes", utilisateurId: id.awa, creeParId: id.managerA, statut: "EN_COURS", avancement: 0, noteSuivi: null, reconduction: true, dateDebut: "2026-11-30", dateFin: "2026-12-06" });
    const mensuelle = await avecEntreprise(ent.A, (tx) => tx.select().from(mission).where(eq(mission.precedenteId, m.mensuelle)));
    expect(mensuelle[0]).toMatchObject({ dateDebut: "2026-11-30", dateFin: "2026-12-29" });
    // Worker resté arrêté : une seule mission, pour la période qui contient aujourd'hui.
    const rattrapage = await avecEntreprise(ent.A, (tx) => tx.select().from(mission).where(eq(mission.precedenteId, m.rattrapage)));
    expect(rattrapage).toHaveLength(1);
    expect(rattrapage[0]).toMatchObject({ dateDebut: "2026-11-30", dateFin: "2026-12-06" });

    // Rien pour les autres.
    for (const cle of ["sansRenouvellement", "annulee", "parti", "longue", "pasFinie"]) {
      const l = await lire(cle);
      expect(l.suivanteCreeeLe).toBeNull();
    }
    expect((await lire("annulee")).statut).toBe("ANNULEE");
    expect((await lire("sansRenouvellement")).statut).toBe("EN_COURS");
  }, 240_000);

  test("idempotent : un second passage, et même deux passages simultanés, ne créent rien de plus", async () => {
    const avant = (await toutes()).length;
    const [r1, r2] = await Promise.all([avecEntreprise(ent.A, (tx) => renouvelerMissions(tx, ent.A, AUJOURDHUI)), avecEntreprise(ent.A, (tx) => renouvelerMissions(tx, ent.A, AUJOURDHUI))]);
    expect(r1.renouvelees + r2.renouvelees).toBe(0);
    expect((await toutes()).length).toBe(avant);

    // Une nouvelle semaine plus tard, la suivante se renouvelle à son tour — et seulement une fois, même sous deux passages simultanés.
    const lundi = "2026-12-07";
    const [a, b] = await Promise.all([avecEntreprise(ent.A, (tx) => renouvelerMissions(tx, ent.A, lundi)), avecEntreprise(ent.A, (tx) => renouvelerMissions(tx, ent.A, lundi))]);
    // Les périodes du 30 novembre au 6 décembre finissent : 3 suites créées la semaine d'avant + la mission « pas encore finie » ; la mensuelle court jusqu'au 29.
    expect(a.renouvelees + b.renouvelees).toBe(4);
  }, 240_000);

  test("la période close ne se suit plus ; seul qui gère la personne coupe ou rétablit le renouvellement ; une annulée, une permanente, une autre entreprise : refusé", async () => {
    const suivante = (await avecEntreprise(ent.A, (tx) => tx.select().from(mission).where(eq(mission.precedenteId, m.enCours))))[0];
    const clotureeVue = (await avecEntreprise(ent.A, (tx) => lireMissions(tx, sess("awa", "EMPLOYE", "A")))).find((x) => x.id === m.enCours);
    expect(clotureeVue?.statut).toBe("CLOTUREE");
    expect((await avecEntreprise(ent.A, (tx) => suivreMission(tx, sess("awa", "EMPLOYE", "A"), m.enCours, { avancement: 80, note: "", terminer: false }))).ok).toBe(false);

    const couper = (u: UtilisateurConnecte, mid: string, actif: boolean) => avecEntreprise(u.entrepriseId, (tx) => definirReconduction(tx, u, mid, actif));
    expect((await couper(sess("awa", "EMPLOYE", "A"), suivante.id, false)).ok).toBe(false); // la personne ne coupe pas sa propre série
    expect((await couper(sess("autreManagerA", "MANAGER", "A"), suivante.id, false)).ok).toBe(false);
    expect((await couper(sess("adminB", "ADMIN", "B"), suivante.id, false)).ok).toBe(false);
    expect((await couper(sess("managerA", "MANAGER", "A"), suivante.id, false)).ok).toBe(true);
    expect((await avecEntreprise(ent.A, async (tx) => (await tx.select().from(mission).where(eq(mission.id, suivante.id)))[0])).reconduction).toBe(false);
    expect((await couper(sess("adminA", "ADMIN", "A"), suivante.id, true)).ok).toBe(true);
    expect((await couper(sess("adminA", "ADMIN", "A"), m.annulee, true)).ok).toBe(false);
    expect((await couper(sess("adminA", "ADMIN", "A"), m.longue, true)).ok).toBe(false);
  }, 240_000);

  test("fuite : l'autre entreprise ne renouvelle rien de celle-ci", async () => {
    const r = await avecEntreprise(ent.B, (tx) => renouvelerMissions(tx, ent.B, "2027-06-01"));
    expect(r).toEqual({ renouvelees: 0, courriers: [] });
    expect(await avecEntreprise(ent.B, (tx) => tx.select({ id: mission.id }).from(mission))).toHaveLength(0);
  }, 120_000);
});

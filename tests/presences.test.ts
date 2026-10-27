import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { demandeConge, dossierRH, entreprise, groupe, jonctionPresence, pointage, utilisateur, validationPresence } from "@/db/schema";
import { chargerFiche, definirGerantPresences, definirPartagePresences, droitSurFiche, enregistrerPresence, isoDuJour, jourDepuisIso, jourModifiable, joindrePartenairePresence, marquerTousPresents, partenairesPresence, rouvrirFiche, statutEffectif, totauxDe, validerFiche, type SectionPresence } from "@/lib/rh/presences";
import type { UtilisateurConnecte } from "@/lib/session";

/**
 * Fiche de présence journalière : tenue par un gérant (Manager) que l'Administrateur peut changer ; chaque ligne est écrite dans `pointage` ; des
 * entreprises du même groupe peuvent être jointes à la fiche, à condition que les DEUX l'aient accepté, sans jamais élargir la RLS.
 */
describe("Fiche de présence — logique pure", () => {
  test("dates : forme stricte, jour modifiable (futur interdit, 31 jours pour le gérant, illimité pour l'Administrateur)", () => {
    expect(jourDepuisIso("2026-10-27")?.getDate()).toBe(27);
    expect(jourDepuisIso("2026-02-31")).toBeNull();
    expect(jourDepuisIso("27/10/2026")).toBeNull();
    expect(isoDuJour(new Date(2026, 9, 5))).toBe("2026-10-05");
    const maintenant = new Date(2026, 9, 27, 14, 0);
    expect(jourModifiable(new Date(2026, 9, 27), "GERANT", maintenant)).toBe(true);
    expect(jourModifiable(new Date(2026, 9, 28), "GERANT", maintenant)).toBe(false);
    expect(jourModifiable(new Date(2026, 8, 26), "GERANT", maintenant)).toBe(true); // 31 jours
    expect(jourModifiable(new Date(2026, 8, 25), "GERANT", maintenant)).toBe(false);
    expect(jourModifiable(new Date(2026, 0, 1), "ADMIN", maintenant)).toBe(true);
    expect(jourModifiable(new Date(2026, 9, 28), "ADMIN", maintenant)).toBe(false);
  });

  test("statut effectif et totaux : un congé approuvé compte comme congé tant que rien n'est saisi", () => {
    const ligne = (statut: "PRESENT" | "RETARD" | "ABSENT" | "CONGE" | null, enCongeApprouve = false) => ({ dossierRHId: "d", utilisateurId: "u", nom: "x", poste: "p", service: null, statut, heureArrivee: null, heureDepart: null, remarque: null, enCongeApprouve, shiftDebut: null, shiftTolerance: 0, saisiPar: null });
    expect(statutEffectif(ligne(null, true))).toBe("CONGE");
    expect(statutEffectif(ligne("PRESENT", true))).toBe("PRESENT");
    expect(statutEffectif(ligne(null))).toBeNull();
    const sections: SectionPresence[] = [{ entrepriseId: "e", entrepriseNom: "E", propre: true, lignes: [ligne("PRESENT"), ligne("RETARD"), ligne("ABSENT"), ligne(null, true), ligne(null)] }];
    expect(totauxDe(sections)).toEqual({ presents: 1, retards: 1, absents: 1, conges: 1, nonRenseignes: 1, total: 5 });
  });
});

describe("Fiche de présence — gérant, saisie, groupe", () => {
  let groupeId: string;
  let a: string;
  let b: string;
  let c: string; // même groupe, partage non activé
  let adminA: string;
  let gerantA: string;
  let autreManagerA: string;
  let employeA: string;
  let employeA2: string;
  let employeB: string;
  let adminB: string;
  let dossierA: string;
  let dossierA2: string;
  let dossierB: string;
  const aujourdhui = isoDuJour(new Date());
  const hier = isoDuJour(new Date(Date.now() - 864e5));
  const ancien = isoDuJour(new Date(Date.now() - 60 * 864e5));
  const demain = isoDuJour(new Date(Date.now() + 864e5));

  const admin = (): UtilisateurConnecte => ({ entrepriseId: a, utilisateurId: adminA, role: "ADMIN" });
  const gerant = (): UtilisateurConnecte => ({ entrepriseId: a, utilisateurId: gerantA, role: "MANAGER" });
  const autreManager = (): UtilisateurConnecte => ({ entrepriseId: a, utilisateurId: autreManagerA, role: "MANAGER" });
  const employe = (): UtilisateurConnecte => ({ entrepriseId: a, utilisateurId: employeA, role: "EMPLOYE" });
  const pointageDe = (ent: string, dossier: string, iso: string) => avecEntreprise(ent, async (tx) => (await tx.select().from(pointage).where(eq(pointage.dossierRHId, dossier))).filter((p) => isoDuJour(p.date) === iso)[0]);

  beforeAll(async () => {
    const [g] = await db.insert(groupe).values({ nom: "TEST Groupe Présences" }).returning({ id: groupe.id });
    groupeId = g.id;
    const creerEntreprise = async (nom: string, niu: string, partage: boolean) => (await db.insert(entreprise).values({ nom, secteurProfil: "agence", niu, groupeId, presencesPartageesGroupe: partage }).returning({ id: entreprise.id }))[0].id;
    a = await creerEntreprise("TEST Présences A", "M012026000131", true);
    b = await creerEntreprise("TEST Présences B", "M012026000132", true);
    c = await creerEntreprise("TEST Présences C", "M012026000133", false);
    const user = async (ent: string, nom: string, role: "ADMIN" | "MANAGER" | "EMPLOYE") => (await db.insert(utilisateur).values({ entrepriseId: ent, email: `pres-${nom}-${ent}@vertexone.test`, nomComplet: `TEST ${nom}`, role }).returning({ id: utilisateur.id }))[0].id;
    adminA = await user(a, "adminA", "ADMIN");
    gerantA = await user(a, "gerantA", "MANAGER");
    autreManagerA = await user(a, "autreManagerA", "MANAGER");
    employeA = await user(a, "employeA", "EMPLOYE");
    employeA2 = await user(a, "employeA2", "EMPLOYE");
    adminB = await user(b, "adminB", "ADMIN");
    employeB = await user(b, "employeB", "EMPLOYE");
    const dossier = async (ent: string, uid: string, poste: string) =>
      avecEntreprise(ent, async (tx) => (await tx.insert(dossierRH).values({ entrepriseId: ent, utilisateurId: uid, poste, typeContrat: "CDI", dateEmbauche: new Date("2024-01-01") }).returning({ id: dossierRH.id }))[0].id);
    dossierA = await dossier(a, employeA, "Comptable");
    dossierA2 = await dossier(a, employeA2, "Magasinier");
    dossierB = await dossier(b, employeB, "Chauffeur");
  }, 120_000);

  afterAll(async () => {
    for (const e of [a, b, c]) {
      if (!e) continue;
      await avecEntreprise(e, async (tx) => {
        await tx.delete(jonctionPresence).where(eq(jonctionPresence.entrepriseId, e));
        await tx.delete(validationPresence).where(eq(validationPresence.entrepriseId, e));
        await tx.delete(demandeConge).where(eq(demandeConge.entrepriseId, e));
        await tx.delete(pointage).where(eq(pointage.entrepriseId, e));
        await tx.delete(dossierRH).where(eq(dossierRH.entrepriseId, e));
      });
    }
    await db.delete(utilisateur).where(inArray(utilisateur.id, [adminA, gerantA, autreManagerA, employeA, employeA2, adminB, employeB].filter(Boolean)));
    await db.delete(entreprise).where(inArray(entreprise.id, [a, b, c].filter(Boolean)));
    await db.delete(groupe).where(eq(groupe.id, groupeId));
  }, 120_000);

  test("l'Administrateur désigne le gérant ; seul un Manager ou Administrateur actif de l'entreprise peut l'être ; l'accès suit", async () => {
    expect(await droitSurFiche(gerant())).toBeNull(); // pas encore désigné
    expect((await definirGerantPresences(a, employeA)).erreur).toContain("Manager ou un Administrateur");
    expect((await definirGerantPresences(a, adminB)).erreur).toBeDefined(); // un Administrateur d'une autre entreprise
    expect(await definirGerantPresences(a, gerantA)).toEqual({});
    expect(await droitSurFiche(gerant())).toBe("GERANT");
    expect(await droitSurFiche(admin())).toBe("ADMIN");
    expect(await droitSurFiche(autreManager())).toBeNull();
    expect(await droitSurFiche(employe())).toBeNull();
    // changer de gérant : l'ancien perd aussitôt l'accès
    expect(await definirGerantPresences(a, autreManagerA)).toEqual({});
    expect(await droitSurFiche(gerant())).toBeNull();
    expect(await droitSurFiche(autreManager())).toBe("GERANT");
    expect(await definirGerantPresences(a, gerantA)).toEqual({});
  }, 60_000);

  test("la fiche liste les employés de l'entreprise ; elle est refusée à un Manager qui n'est pas gérant et à un Employé", async () => {
    const fiche = await chargerFiche(gerant(), aujourdhui);
    expect(fiche?.sections).toHaveLength(1);
    expect(fiche?.sections[0].lignes.map((l) => l.nom)).toEqual(["TEST employeA", "TEST employeA2"]);
    expect(fiche?.gerant?.id).toBe(gerantA);
    expect(fiche?.totaux.nonRenseignes).toBe(2);
    expect(await chargerFiche(autreManager(), aujourdhui)).toBeNull();
    expect(await chargerFiche(employe(), aujourdhui)).toBeNull();
    expect(await chargerFiche(gerant(), "pas-une-date")).toBeNull();
  }, 60_000);

  test("saisie : présent avec heures, retard, absent (heures effacées) ; trace de l'auteur ; contrôles des heures", async () => {
    expect(await enregistrerPresence(gerant(), { entrepriseId: a, dossierRHId: dossierA, date: aujourdhui, statut: "PRESENT", heureArrivee: "08:05", heureDepart: "17:00", remarque: "RAS" })).toEqual({});
    let p = await pointageDe(a, dossierA, aujourdhui);
    expect(p.statut).toBe("PRESENT");
    expect(p.saisiParId).toBe(gerantA);
    expect(p.remarque).toBe("RAS");
    expect(p.heureArrivee?.getHours()).toBe(8);

    expect(await enregistrerPresence(gerant(), { entrepriseId: a, dossierRHId: dossierA, date: aujourdhui, statut: "RETARD", heureArrivee: "09:30" })).toEqual({});
    p = await pointageDe(a, dossierA, aujourdhui);
    expect(p.statut).toBe("RETARD");
    expect(p.heureDepart).toBeNull(); // la saisie remplace la ligne

    expect(await enregistrerPresence(gerant(), { entrepriseId: a, dossierRHId: dossierA, date: aujourdhui, statut: "ABSENT", heureArrivee: "08:00", remarque: "Malade" })).toEqual({});
    p = await pointageDe(a, dossierA, aujourdhui);
    expect(p.statut).toBe("ABSENT");
    expect(p.heureArrivee).toBeNull();

    expect((await enregistrerPresence(gerant(), { entrepriseId: a, dossierRHId: dossierA, date: aujourdhui, statut: "PRESENT", heureArrivee: "25:99" })).erreur).toContain("invalide");
    expect((await enregistrerPresence(gerant(), { entrepriseId: a, dossierRHId: dossierA, date: aujourdhui, statut: "PRESENT", heureArrivee: "10:00", heureDepart: "09:00" })).erreur).toContain("précéder");
    expect((await enregistrerPresence(gerant(), { entrepriseId: a, dossierRHId: dossierA, date: aujourdhui, statut: "INCONNU" as never })).erreur).toBeDefined();
  }, 60_000);

  test("droits d'écriture : ni un autre Manager, ni un Employé ; pas de jour futur ; le gérant est limité à 31 jours, l'Administrateur non", async () => {
    const base = { entrepriseId: a, dossierRHId: dossierA2, statut: "PRESENT" as const };
    expect((await enregistrerPresence(autreManager(), { ...base, date: aujourdhui })).erreur).toContain("gérant");
    expect((await enregistrerPresence(employe(), { ...base, date: aujourdhui })).erreur).toContain("gérant");
    expect((await enregistrerPresence(gerant(), { ...base, date: demain })).erreur).toBeDefined();
    expect((await enregistrerPresence(admin(), { ...base, date: demain })).erreur).toContain("à venir");
    expect((await enregistrerPresence(gerant(), { ...base, date: ancien })).erreur).toContain("plus modifiable");
    expect(await enregistrerPresence(admin(), { ...base, date: ancien })).toEqual({});
    expect(await enregistrerPresence(gerant(), { ...base, date: hier })).toEqual({});
  }, 60_000);

  test("jamais l'employé d'une autre entreprise sans jonction : ni dossier étranger, ni entreprise non jointe", async () => {
    expect((await enregistrerPresence(gerant(), { entrepriseId: a, dossierRHId: dossierB, date: aujourdhui, statut: "PRESENT" })).erreur).toBe("Employé introuvable.");
    expect((await enregistrerPresence(gerant(), { entrepriseId: b, dossierRHId: dossierB, date: aujourdhui, statut: "PRESENT" })).erreur).toContain("pas jointe");
  }, 60_000);

  test("groupe : l'Administrateur ne peut joindre que si les DEUX ont activé ; une entreprise qui n'a pas accepté est refusée", async () => {
    await definirPartagePresences(a, false);
    expect((await joindrePartenairePresence(a, adminA, b, true)).erreur).toContain("Activez d'abord");
    await definirPartagePresences(a, true);
    expect((await joindrePartenairePresence(a, adminA, c, true)).erreur).toContain("n'a pas activé");
    expect((await joindrePartenairePresence(a, adminA, "entreprise-inconnue", true)).erreur).toContain("pas dans votre groupe");
    expect(await joindrePartenairePresence(a, adminA, b, true)).toEqual({});
    expect(await joindrePartenairePresence(a, adminA, b, true)).toEqual({}); // idempotent
    expect((await partenairesPresence(a)).map((p) => p.id)).toEqual([b]);
  }, 60_000);

  test("fiche jointe : les employés du partenaire apparaissent, le gérant les gère, la ligne est écrite DANS l'entreprise de l'employé", async () => {
    const fiche = await chargerFiche(gerant(), aujourdhui);
    expect(fiche?.sections.map((s) => s.entrepriseNom)).toEqual(["TEST Présences A", "TEST Présences B"]);
    expect(fiche?.sections[1].propre).toBe(false);
    expect(fiche?.sections[1].lignes.map((l) => l.nom)).toEqual(["TEST employeB"]);

    expect(await enregistrerPresence(gerant(), { entrepriseId: b, dossierRHId: dossierB, date: aujourdhui, statut: "PRESENT", heureArrivee: "07:55" })).toEqual({});
    const p = await pointageDe(b, dossierB, aujourdhui);
    expect(p.entrepriseId).toBe(b);
    expect(p.saisiParId).toBe(gerantA);
    // la RLS reste stricte : A ne lit pas le pointage de B
    expect(await avecEntreprise(a, (tx) => tx.select().from(pointage).where(eq(pointage.dossierRHId, dossierB)))).toEqual([]);
    // le dossier d'un employé de A ne s'écrit jamais en visant B
    expect((await enregistrerPresence(gerant(), { entrepriseId: b, dossierRHId: dossierA, date: aujourdhui, statut: "PRESENT" })).erreur).toBe("Employé introuvable.");
  }, 60_000);

  test("couper le partage d'un côté détache aussitôt l'entreprise de la fiche ; détacher est toujours possible", async () => {
    await definirPartagePresences(b, false);
    try {
      expect(await partenairesPresence(a)).toEqual([]);
      expect((await chargerFiche(gerant(), aujourdhui))?.sections).toHaveLength(1);
      expect((await enregistrerPresence(gerant(), { entrepriseId: b, dossierRHId: dossierB, date: aujourdhui, statut: "ABSENT" })).erreur).toContain("pas jointe");
    } finally {
      await definirPartagePresences(b, true);
    }
    expect((await partenairesPresence(a)).map((p) => p.id)).toEqual([b]);
    expect(await joindrePartenairePresence(a, adminA, b, false)).toEqual({});
    expect(await partenairesPresence(a)).toEqual([]);
    expect(await joindrePartenairePresence(a, adminA, b, true)).toEqual({}); // rejoint pour la suite
  }, 60_000);

  test("appel rapide : « tous présents » ne touche ni les lignes déjà saisies ni les congés approuvés, y compris chez le partenaire", async () => {
    await avecEntreprise(b, async (tx) => {
      await tx.delete(pointage).where(eq(pointage.dossierRHId, dossierB));
    });
    await avecEntreprise(a, async (tx) => {
      await tx.delete(pointage).where(eq(pointage.dossierRHId, dossierA2));
      await tx.insert(demandeConge).values({ entrepriseId: a, dossierRHId: dossierA2, type: "CONGE_PAYE", dateDebut: new Date(`${aujourdhui}T00:00:00`), dateFin: new Date(`${aujourdhui}T00:00:00`), nombreJours: 1, statut: "APPROUVEE" });
    });
    const r = await marquerTousPresents(gerant(), aujourdhui);
    expect(r.erreur).toBeUndefined();
    expect(r.nombre).toBe(1); // seul l'employé de B : employeA est déjà saisi (absent), employeA2 est en congé
    expect((await pointageDe(a, dossierA, aujourdhui)).statut).toBe("ABSENT");
    expect(await pointageDe(a, dossierA2, aujourdhui)).toBeUndefined();
    expect((await pointageDe(b, dossierB, aujourdhui)).statut).toBe("PRESENT");
    const fiche = await chargerFiche(gerant(), aujourdhui);
    expect(fiche?.sections[0].lignes.find((l) => l.dossierRHId === dossierA2)?.enCongeApprouve).toBe(true);
    expect(fiche?.totaux.conges).toBe(1);
  }, 90_000);

  test("validation : le gérant valide, plus rien ne se modifie sauf par l'Administrateur qui peut rouvrir", async () => {
    expect(await validerFiche(gerant(), aujourdhui)).toEqual({});
    expect((await chargerFiche(gerant(), aujourdhui))?.validee?.parNom).toBe("TEST gerantA");
    expect((await chargerFiche(gerant(), aujourdhui))?.modifiable).toBe(false);
    expect((await enregistrerPresence(gerant(), { entrepriseId: a, dossierRHId: dossierA, date: aujourdhui, statut: "PRESENT" })).erreur).toContain("validée");
    expect((await marquerTousPresents(gerant(), aujourdhui)).erreur).toContain("validée");
    expect((await rouvrirFiche(gerant(), aujourdhui)).erreur).toContain("Administrateur");
    expect(await enregistrerPresence(admin(), { entrepriseId: a, dossierRHId: dossierA, date: aujourdhui, statut: "PRESENT" })).toEqual({}); // l'Administrateur garde la main
    expect(await rouvrirFiche(admin(), aujourdhui)).toEqual({});
    expect((await chargerFiche(gerant(), aujourdhui))?.validee).toBeNull();
    expect(await enregistrerPresence(gerant(), { entrepriseId: a, dossierRHId: dossierA, date: aujourdhui, statut: "ABSENT" })).toEqual({});
  }, 90_000);
});

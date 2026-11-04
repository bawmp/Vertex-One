import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { contact, dossier, dossierRH, entreprise, invitation, projet, rappelAnniversaire, tache, tacheCrm, utilisateur } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";
import type { UtilisateurConnecte } from "@/lib/session";

vi.mock("server-only", () => ({}));

const envoyes: { to: string; subject: string; html: string }[] = [];
vi.mock("@/lib/email/client", () => ({ envoyerEmail: async (m: { to: string; subject: string; html: string }) => { envoyes.push(m); return { envoye: true }; } }));
vi.mock("@/lib/invitations/envoi", () => ({ envoyerEmailInvitation: async () => ({ envoye: true }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
let connecte: UtilisateurConnecte | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

const { ageAu, anniversairesProches, erreurDateNaissance, jourAnniversaire, prochainAnniversaire } = await import("@/lib/rh/anniversaires-regles");
const { modifierInfosPersonnelles, peutModifierInfos, validerInfosPersonnelles } = await import("@/lib/rh/infos-personnelles");
const { validerNouveauCollaborateur } = await import("@/lib/rh/nouveau-collaborateur");
const { personnesVisiblesAvecNaissance, traiterRappelsAnniversaires } = await import("@/lib/rh/anniversaires");
const { tachesDuCollaborateur } = await import("@/lib/rh/taches-collaborateur");
const { peutVoirSalaire } = await import("@/lib/rh/acces");
const { initiales } = await import("@/lib/rh/photo");
const { inviterCollaborateur } = await import("@/lib/actions/nouveau-collaborateur");

describe("Anniversaires — règles pures", () => {
  test("prochain anniversaire : aujourd'hui, demain, passage d'année, 29 février", () => {
    expect(prochainAnniversaire("1990-03-12", "2026-03-12")).toEqual({ date: "2026-03-12", jours: 0, age: 36 });
    expect(prochainAnniversaire("1990-03-13", "2026-03-12")).toEqual({ date: "2026-03-13", jours: 1, age: 36 });
    expect(prochainAnniversaire("1990-01-05", "2026-12-30")).toEqual({ date: "2027-01-05", jours: 6, age: 37 });
    expect(jourAnniversaire("2000-02-29", 2026)).toBe("2026-02-28");
    expect(jourAnniversaire("2000-02-29", 2028)).toBe("2028-02-29");
    expect(prochainAnniversaire("2000-02-29", "2026-02-28")?.jours).toBe(0);
    expect(prochainAnniversaire("pas une date", "2026-02-28")).toBeNull();
  });

  test("âge et validité de la date de naissance", () => {
    expect(ageAu("1990-03-12", "2026-03-11")).toBe(35);
    expect(ageAu("1990-03-12", "2026-03-12")).toBe(36);
    expect(erreurDateNaissance("1990-02-31", "2026-11-04")).toMatch(/pas valide/);
    expect(erreurDateNaissance("2027-01-01", "2026-11-04")).toMatch(/futur/);
    expect(erreurDateNaissance("2020-01-01", "2026-11-04")).toMatch(/âge/);
    expect(erreurDateNaissance("1850-01-01", "2026-11-04")).toMatch(/âge/);
    expect(erreurDateNaissance("1995-06-15", "2026-11-04")).toBeNull();
  });

  test("les anniversaires proches sont triés et bornés par la fenêtre", () => {
    const l = [
      { type: "UTILISATEUR" as const, id: "a", nom: "Zoé", naissance: "1990-11-10" },
      { type: "STAGIAIRE" as const, id: "b", nom: "Alain", naissance: "2001-11-04" },
      { type: "UTILISATEUR" as const, id: "c", nom: "Marc", naissance: "1985-02-01" },
      { type: "UTILISATEUR" as const, id: "d", nom: "Bea", naissance: "1992-11-10" },
    ];
    const r = anniversairesProches(l, "2026-11-04", 30);
    expect(r.map((x) => x.nom)).toEqual(["Alain", "Bea", "Zoé"]);
    expect(r[0].jours).toBe(0);
  });

  test("initiales de l'avatar", () => {
    expect(initiales("Alice Admin")).toBe("AA");
    expect(initiales("  jean  paul  mbarga ")).toBe("JM");
    expect(initiales("")).toBe("?");
  });
});

describe("Fiche collaborateur — validations pures", () => {
  test("informations personnelles : champs vides effacés, téléphone et date contrôlés", () => {
    const ok = validerInfosPersonnelles({ dateNaissance: "1995-06-15", telephone: "+237 690 11 22 33", adresse: " Bonamoussadi ", urgenceNom: "", urgenceTelephone: "" }, "2026-11-04");
    expect(ok).toEqual({ ok: true, valeurs: { dateNaissance: "1995-06-15", telephone: "+237 690 11 22 33", adresse: "Bonamoussadi", urgenceNom: null, urgenceTelephone: null } });
    expect(validerInfosPersonnelles({ dateNaissance: "", telephone: "", adresse: "", urgenceNom: "", urgenceTelephone: "" }, "2026-11-04")).toMatchObject({ ok: true });
    expect(validerInfosPersonnelles({ dateNaissance: "", telephone: "abc", adresse: "", urgenceNom: "", urgenceTelephone: "" }, "2026-11-04")).toMatchObject({ ok: false });
    expect(validerInfosPersonnelles({ dateNaissance: "2030-01-01", telephone: "", adresse: "", urgenceNom: "", urgenceTelephone: "" }, "2026-11-04")).toMatchObject({ ok: false });
    expect(validerInfosPersonnelles({ dateNaissance: "", telephone: "", adresse: "x".repeat(201), urgenceNom: "", urgenceTelephone: "" }, "2026-11-04")).toMatchObject({ ok: false });
  });

  test("nouveau collaborateur : fin obligatoire pour CDD, stage et mission, jamais de salaire", () => {
    const base = { email: " Bob@Exemple.cm ", poste: "Comptable", typeContrat: "CDI", dateEmbauche: "2026-11-10", dateFin: "", dateNaissance: "" };
    expect(validerNouveauCollaborateur(base, "2026-11-04")).toMatchObject({ ok: true, valeurs: { email: "bob@exemple.cm", dateFin: null, dateNaissance: null } });
    expect(validerNouveauCollaborateur({ ...base, typeContrat: "STAGE" }, "2026-11-04")).toMatchObject({ ok: false });
    expect(validerNouveauCollaborateur({ ...base, typeContrat: "PRESTATAIRE", dateFin: "2026-11-10" }, "2026-11-04")).toMatchObject({ ok: false });
    expect(validerNouveauCollaborateur({ ...base, typeContrat: "PRESTATAIRE", dateFin: "2027-01-10" }, "2026-11-04")).toMatchObject({ ok: true });
    expect(validerNouveauCollaborateur({ ...base, typeContrat: "MANAGER" }, "2026-11-04")).toMatchObject({ ok: false });
    expect(validerNouveauCollaborateur({ ...base, email: "pas-un-email" }, "2026-11-04")).toMatchObject({ ok: false });
    expect(Object.keys((validerNouveauCollaborateur(base, "2026-11-04") as { valeurs: object }).valeurs)).not.toContain("salaire");
  });

  test("qui voit le salaire : l'Administrateur et la personne, jamais le Manager", () => {
    const u = (role: "ADMIN" | "MANAGER" | "EMPLOYE", id: string) => ({ utilisateurId: id, entrepriseId: "e", role }) as UtilisateurConnecte;
    expect(peutVoirSalaire(u("ADMIN", "a"), "x")).toBe(true);
    expect(peutVoirSalaire(u("EMPLOYE", "x"), "x")).toBe(true);
    expect(peutVoirSalaire(u("MANAGER", "m"), "x")).toBe(false);
    expect(peutModifierInfos(u("MANAGER", "m"), "x", ["x"])).toBe(true);
    expect(peutModifierInfos(u("MANAGER", "m"), "x", ["y"])).toBe(false);
    expect(peutModifierInfos(u("EMPLOYE", "e1"), "e2", "TOUT")).toBe(false);
  });
});

describe("Fiche collaborateur — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Fiche A ${suffixe}`;
  const nomB = `TEST Fiche B ${suffixe}`;
  let A = "";
  let B = "";
  const id: Record<string, string> = {};
  const dos: Record<string, string> = {};
  const sess = (cle: string, role: "ADMIN" | "MANAGER" | "EMPLOYE", entrepriseId: string) => ({ utilisateurId: id[cle], entrepriseId, role, modulesAutorises: null }) as unknown as UtilisateurConnecte;
  const aujourdhui = "2026-11-04";

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const nouveau = async (cle: string, entrepriseId: string, role: "ADMIN" | "MANAGER" | "EMPLOYE", managerId?: string) => {
      const [x] = await db.insert(utilisateur).values({ entrepriseId, email: `fc-${cle}-${suffixe}@vertexone.test`, nomComplet: `Personne ${cle}`, role, managerId }).returning({ id: utilisateur.id });
      id[cle] = x.id;
    };
    await nouveau("adminA", A, "ADMIN");
    await nouveau("managerA", A, "MANAGER");
    await nouveau("equipeA", A, "EMPLOYE", id.managerA);
    await nouveau("horsEquipeA", A, "EMPLOYE");
    await nouveau("adminB", B, "ADMIN");
    await nouveau("employeB", B, "EMPLOYE");
    const fiche = async (cle: string, entrepriseId: string, naissance: string | null) => {
      const [d] = await avecEntreprise(entrepriseId, (tx) => tx.insert(dossierRH).values({ entrepriseId, utilisateurId: id[cle], poste: "Poste", typeContrat: "CDI", dateEmbauche: new Date("2025-01-01"), dateNaissance: naissance, salaireBase: 500_000 }).returning({ id: dossierRH.id }));
      dos[cle] = d.id;
    };
    await fiche("adminA", A, "1980-11-04"); // anniversaire aujourd'hui
    await fiche("managerA", A, "1985-05-05");
    await fiche("equipeA", A, "1995-11-04"); // aujourd'hui
    await fiche("horsEquipeA", A, "1990-11-20");
    await fiche("employeB", B, "1992-11-04");
  }, 120_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 120_000);

  beforeEach(() => {
    envoyes.length = 0;
    connecte = null;
  });

  test("informations personnelles : la personne, l'Administrateur et le Manager de l'équipe peuvent ; pas un collègue ni une autre entreprise", async () => {
    const saisie = { dateNaissance: "1995-11-04", telephone: "690 00 00 00", adresse: "Douala", urgenceNom: "Maman", urgenceTelephone: "677 00 00 00" };
    expect((await avecEntreprise(A, (tx) => modifierInfosPersonnelles(tx, sess("equipeA", "EMPLOYE", A), dos.equipeA, saisie, aujourdhui))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => modifierInfosPersonnelles(tx, sess("managerA", "MANAGER", A), dos.equipeA, { ...saisie, telephone: "691 11 11 11" }, aujourdhui))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => modifierInfosPersonnelles(tx, sess("adminA", "ADMIN", A), dos.horsEquipeA, saisie, aujourdhui))).ok).toBe(true);
    // Un Manager ne touche pas la fiche d'une personne hors de son équipe.
    expect((await avecEntreprise(A, (tx) => modifierInfosPersonnelles(tx, sess("managerA", "MANAGER", A), dos.horsEquipeA, saisie, aujourdhui))).ok).toBe(false);
    // Un collègue ne touche pas la fiche d'un autre.
    expect((await avecEntreprise(A, (tx) => modifierInfosPersonnelles(tx, sess("equipeA", "EMPLOYE", A), dos.horsEquipeA, saisie, aujourdhui))).ok).toBe(false);
    // Une autre entreprise ne trouve même pas la fiche.
    const autre = await avecEntreprise(B, (tx) => modifierInfosPersonnelles(tx, sess("adminB", "ADMIN", B), dos.equipeA, saisie, aujourdhui));
    expect(autre).toEqual({ ok: false, erreur: "Fiche introuvable." });
    const [relu] = await avecEntreprise(A, (tx) => tx.select({ t: dossierRH.telephone, s: dossierRH.salaireBase }).from(dossierRH).where(eq(dossierRH.id, dos.equipeA)));
    expect(relu.t).toBe("691 11 11 11");
    expect(relu.s).toBe(500_000); // le salaire n'a pas bougé
  }, 120_000);

  test("anniversaires visibles : l'Administrateur voit tout, le Manager son équipe, l'Employé rien, jamais une autre entreprise", async () => {
    const noms = async (cle: string, role: "ADMIN" | "MANAGER" | "EMPLOYE", ent: string) => (await avecEntreprise(ent, (tx) => personnesVisiblesAvecNaissance(tx, sess(cle, role, ent)))).map((p) => p.nom).sort();
    expect(await noms("adminA", "ADMIN", A)).toEqual(["Personne equipeA", "Personne horsEquipeA", "Personne managerA"]); // pas soi-même
    expect(await noms("managerA", "MANAGER", A)).toEqual(["Personne equipeA"]);
    expect(await noms("equipeA", "EMPLOYE", A)).toEqual([]);
    expect(await noms("adminB", "ADMIN", B)).toEqual(["Personne employeB"]);
  }, 120_000);

  test("rappel du jour : Administrateurs et responsable prévenus, jamais la personne elle-même, une seule fois par an, chaque entreprise chez elle", async () => {
    const r = await avecEntreprise(A, (tx) => traiterRappelsAnniversaires(tx, A, aujourdhui));
    expect(r.anniversaires).toBe(3); // adminA, equipeA et horsEquipeA (même date de naissance saisie plus haut)
    const vers = Object.fromEntries(envoyes.map((m) => [m.to, m]));
    // adminA reçoit equipeA seulement (son propre anniversaire est exclu) ; managerA (responsable de equipeA) reçoit equipeA.
    expect(vers[`fc-adminA-${suffixe}@vertexone.test`].html).toContain("Personne equipeA");
    expect(vers[`fc-adminA-${suffixe}@vertexone.test`].html).not.toContain("Personne adminA");
    expect(vers[`fc-managerA-${suffixe}@vertexone.test`].html).toContain("Personne equipeA");
    expect(envoyes.some((m) => m.to.includes("equipeA"))).toBe(false); // la personne n'est pas prévenue de son propre anniversaire
    expect(envoyes.some((m) => m.to.includes("employeB") || m.to.includes("adminB"))).toBe(false);
    expect(envoyes.some((m) => m.html.includes("employeB"))).toBe(false);

    envoyes.length = 0;
    const rejeu = await avecEntreprise(A, (tx) => traiterRappelsAnniversaires(tx, A, aujourdhui));
    expect(rejeu).toEqual({ anniversaires: 0, destinataires: 0 });
    expect(envoyes).toHaveLength(0);
    const lignes = await avecEntreprise(A, (tx) => tx.select().from(rappelAnniversaire));
    expect(lignes).toHaveLength(3);
    // Chez B : un seul anniversaire, l'Administrateur de B est prévenu.
    const rb = await avecEntreprise(B, (tx) => traiterRappelsAnniversaires(tx, B, aujourdhui));
    expect(rb.anniversaires).toBe(1);
    expect(envoyes.every((m) => m.to.includes("B") || m.to.includes("adminB"))).toBe(true);
    expect((await avecEntreprise(B, (tx) => tx.select().from(rappelAnniversaire))).length).toBe(1);
  }, 180_000);

  test("tâches de la fiche : projets et activités CRM non terminées, terminées récentes comptées, jamais celles d'un autre", async () => {
    await avecEntreprise(A, async (tx) => {
      const [c] = await tx.insert(contact).values({ entrepriseId: A, nom: "Client", telephone: "690111222", assigneAId: id.adminA }).returning({ id: contact.id });
      const [d] = await tx.insert(dossier).values({ entrepriseId: A, contactId: c.id, titre: "Dossier", responsableId: id.adminA }).returning({ id: dossier.id });
      const [p] = await tx.insert(projet).values({ entrepriseId: A, dossierId: d.id, titre: "Site web", responsablePrincipalId: id.adminA }).returning({ id: projet.id });
      const t = (titre: string, statut: "A_FAIRE" | "EN_COURS" | "TERMINEE", assigne: string, echeance: Date | null, termineeLe: Date | null = null) => ({ entrepriseId: A, projetId: p.id, titre, statut, assigneAId: assigne, echeance, creeParId: id.adminA, termineeLe });
      await tx.insert(tache).values([
        t("Maquette", "EN_COURS", id.equipeA, new Date("2026-11-01")),
        t("Intégration", "A_FAIRE", id.equipeA, new Date("2026-12-01")),
        t("Livraison", "TERMINEE", id.equipeA, null, new Date("2026-10-30")),
        t("Autre personne", "A_FAIRE", id.horsEquipeA, null),
      ]);
      await tx.insert(tacheCrm).values({ entrepriseId: A, objet: "Rappeler le client", assigneAId: id.equipeA, creeParId: id.adminA, dateEcheance: new Date("2026-11-10") });
    });
    const t = await avecEntreprise(A, (tx) => tachesDuCollaborateur(tx, A, id.equipeA, new Date("2026-11-04T10:00:00Z")));
    expect(t.ouvertes.map((x) => x.titre)).toEqual(["Maquette", "Rappeler le client", "Intégration"]);
    expect(t.enRetard).toBe(1);
    expect(t.termineesRecemment).toBe(1);
    expect(t.ouvertes[0].origine).toBe("Projet Site web");
    // Une autre entreprise ne voit aucune de ces tâches.
    expect((await avecEntreprise(B, (tx) => tachesDuCollaborateur(tx, B, id.equipeA))).ouvertes).toEqual([]);
  }, 120_000);

  test("création d'une fiche par un Manager : rôle Employé d'office, lui comme responsable, aucun salaire ; un Employé ne peut pas", async () => {
    const formulaire = (champs: Record<string, string>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(champs)) f.set(k, v);
      return f;
    };
    const base = { email: `nouveau-${suffixe}@vertexone.test`, poste: "Assistant", typeContrat: "CDD", dateEmbauche: "2026-12-01", dateFin: "2027-06-01", dateNaissance: "1999-04-20", salaire: "9999999", role: "ADMIN" };
    connecte = sess("managerA", "MANAGER", A);
    const r = await inviterCollaborateur(null, formulaire(base));
    expect(r?.succes).toBeTruthy();
    const [inv] = await avecEntreprise(A, (tx) => tx.select().from(invitation).where(eq(invitation.email, base.email)));
    expect(inv).toMatchObject({ roleProposee: "EMPLOYE", typeContratPropose: "CDD", managerPropose: id.managerA, dateNaissancePropose: "1999-04-20", postePropose: "Assistant" });
    expect(Object.keys(inv)).not.toContain("salaire");
    // Le responsable demandé par un Manager est ignoré (il l'est d'office).
    connecte = sess("managerA", "MANAGER", A);
    await inviterCollaborateur(null, formulaire({ ...base, email: `deux-${suffixe}@vertexone.test`, responsableId: id.horsEquipeA }));
    const [inv2] = await avecEntreprise(A, (tx) => tx.select().from(invitation).where(eq(invitation.email, `deux-${suffixe}@vertexone.test`)));
    expect(inv2.managerPropose).toBe(id.managerA);
    // Un Employé n'a pas ce droit ; l'Administrateur ne peut pas désigner le responsable d'une autre entreprise.
    connecte = sess("equipeA", "EMPLOYE", A);
    expect((await inviterCollaborateur(null, formulaire({ ...base, email: `trois-${suffixe}@vertexone.test` })))?.erreur).toMatch(/pas le droit/);
    connecte = sess("adminA", "ADMIN", A);
    expect((await inviterCollaborateur(null, formulaire({ ...base, email: `quatre-${suffixe}@vertexone.test`, responsableId: id.employeB })))?.erreur).toMatch(/introuvable/);
    // Une adresse qui a déjà un compte est refusée.
    expect((await inviterCollaborateur(null, formulaire({ ...base, email: `fc-equipeA-${suffixe}@vertexone.test` })))?.erreur).toMatch(/déjà un compte/);
  }, 180_000);
});

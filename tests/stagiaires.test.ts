import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { dossierRH, entreprise, invitation, stagiaireAcademique, utilisateur } from "@/db/schema";
import { cloturerStagiaireAcademique, convertirStagiaireEnInvitation, creerStagiaireAcademique, deciderStagePro, etatStage, joursRestants, listerStagiairesAcademiques, listerStagiairesPro, modifierStagiaireAcademique, supprimerStagiaireAcademique, trouverStagiaireAcademique, type SaisieStagiaire } from "@/lib/rh/stage";
import type { UtilisateurConnecte } from "@/lib/session";

/**
 * Stagiaires : professionnel (employé de contrat STAGE en période probatoire, décision embauché / non retenu) et académique (fiche sans compte,
 * indemnité réservée à l'Administrateur). Jamais d'une entreprise à l'autre, jamais l'indemnité à un Manager, jamais une décision prise deux fois.
 */
describe("Stagiaires", () => {
  let entrepriseId: string;
  let autreEntrepriseId: string;
  let adminId: string;
  let managerId: string;
  let employeEquipeId: string; // stagiaire pro dans l'équipe du manager
  let employeHorsEquipeId: string;
  let autreAdminId: string;
  let dossierProId: string;
  let dossierHorsEquipeId: string;

  const admin = (): UtilisateurConnecte => ({ entrepriseId, utilisateurId: adminId, role: "ADMIN" });
  const manager = (): UtilisateurConnecte => ({ entrepriseId, utilisateurId: managerId, role: "MANAGER" });
  const employe = (): UtilisateurConnecte => ({ entrepriseId, utilisateurId: employeEquipeId, role: "EMPLOYE" });
  const saisie = (extra: Partial<SaisieStagiaire> = {}): SaisieStagiaire => ({ nom: "Étudiant Test", email: "etudiant@exemple.test", etablissement: "Université Test", filiere: "Informatique", dateDebut: new Date("2026-07-01"), dateFin: new Date("2026-09-30"), indemniteMensuelle: 50000, ...extra });
  const dossier = (id: string) => avecEntreprise(entrepriseId, async (tx) => (await tx.select().from(dossierRH).where(eq(dossierRH.id, id)))[0]);

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Stagiaires", secteurProfil: "agence", niu: "M012026000121" }).returning({ id: entreprise.id });
    entrepriseId = e.id;
    const [e2] = await db.insert(entreprise).values({ nom: "TEST Stagiaires B", secteurProfil: "agence", niu: "M012026000122" }).returning({ id: entreprise.id });
    autreEntrepriseId = e2.id;
    const cree = async (ent: string, nom: string, role: "ADMIN" | "MANAGER" | "EMPLOYE", managerRef?: string) => (await db.insert(utilisateur).values({ entrepriseId: ent, email: `stg-${nom}-${ent}@vertexone.test`, nomComplet: `TEST ${nom}`, role, managerId: managerRef }).returning({ id: utilisateur.id }))[0].id;
    adminId = await cree(entrepriseId, "admin", "ADMIN");
    managerId = await cree(entrepriseId, "manager", "MANAGER");
    employeEquipeId = await cree(entrepriseId, "stagiaire-equipe", "EMPLOYE", managerId);
    employeHorsEquipeId = await cree(entrepriseId, "stagiaire-hors", "EMPLOYE");
    autreAdminId = await cree(autreEntrepriseId, "adminb", "ADMIN");
    await avecEntreprise(entrepriseId, async (tx) => {
      const [d] = await tx.insert(dossierRH).values({ entrepriseId, utilisateurId: employeEquipeId, poste: "Développeur", typeContrat: "STAGE", dateEmbauche: new Date("2026-06-01"), dateFinContrat: new Date(Date.now() + 10 * 864e5), salaireBase: 80000 }).returning({ id: dossierRH.id });
      dossierProId = d.id;
      const [h] = await tx.insert(dossierRH).values({ entrepriseId, utilisateurId: employeHorsEquipeId, poste: "Comptable", typeContrat: "STAGE", dateEmbauche: new Date("2026-06-01"), dateFinContrat: new Date(Date.now() - 5 * 864e5) }).returning({ id: dossierRH.id });
      dossierHorsEquipeId = h.id;
    });
  }, 90_000);

  afterAll(async () => {
    for (const e of [entrepriseId, autreEntrepriseId]) {
      await avecEntreprise(e, async (tx) => {
        await tx.delete(stagiaireAcademique).where(eq(stagiaireAcademique.entrepriseId, e));
        await tx.delete(invitation).where(eq(invitation.entrepriseId, e));
        await tx.delete(dossierRH).where(eq(dossierRH.entrepriseId, e));
      });
    }
    await db.delete(utilisateur).where(inArray(utilisateur.id, [adminId, managerId, employeEquipeId, employeHorsEquipeId, autreAdminId]));
    await db.delete(entreprise).where(inArray(entreprise.id, [entrepriseId, autreEntrepriseId]));
  }, 90_000);

  test("état d'un stage : en cours, bientôt fini (≤ 14 jours), échu sans décision, décidé", () => {
    const now = new Date("2026-10-27T10:00:00");
    expect(etatStage(new Date("2026-12-31"), false, now)).toBe("EN_COURS");
    expect(etatStage(new Date("2026-11-05"), false, now)).toBe("BIENTOT_FINI");
    expect(etatStage(new Date("2026-10-20"), false, now)).toBe("ECHU");
    expect(etatStage(new Date("2026-10-20"), true, now)).toBe("DECIDE");
    expect(etatStage(null, false, now)).toBe("EN_COURS");
    expect(joursRestants(new Date("2026-10-30T10:00:00"), now)).toBe(3);
  });

  test("stagiaire professionnel : les dossiers STAGE sont listés selon la portée (Administrateur : tous ; Manager : son équipe ; Employé : aucun)", async () => {
    const tous = await avecEntreprise(entrepriseId, (tx) => listerStagiairesPro(tx, admin()));
    expect(tous.map((l) => l.id).sort()).toEqual([dossierProId, dossierHorsEquipeId].sort());
    const equipe = await avecEntreprise(entrepriseId, (tx) => listerStagiairesPro(tx, manager()));
    expect(equipe.map((l) => l.id)).toEqual([dossierProId]);
    expect(await avecEntreprise(entrepriseId, (tx) => listerStagiairesPro(tx, employe()))).toEqual([]);
  }, 60_000);

  test("décision « embauché » : le contrat devient CDI, la décision est tracée, et ne peut pas être reprise", async () => {
    const r = await avecEntreprise(entrepriseId, (tx) => deciderStagePro(tx, entrepriseId, dossierProId, { decision: "EMBAUCHE", typeContrat: "CDI" }, new Date("2026-11-01"), "Très bon stage"));
    expect(r).toEqual({});
    const d = await dossier(dossierProId);
    expect(d.typeContrat).toBe("CDI");
    expect(d.dateFinContrat).toBeNull();
    expect(d.decisionStage).toBe("EMBAUCHE");
    expect(d.motifDecisionStage).toBe("Très bon stage");
    expect((await avecEntreprise(entrepriseId, (tx) => deciderStagePro(tx, entrepriseId, dossierProId, { decision: "NON_RETENU" }, new Date()))).erreur).toBeDefined();
    // un stagiaire embauché reste visible avec sa décision
    const liste = await avecEntreprise(entrepriseId, (tx) => listerStagiairesPro(tx, admin()));
    expect(liste.find((l) => l.id === dossierProId)?.decisionStage).toBe("EMBAUCHE");
    // le compte est conservé
    const [u] = await db.select({ statut: utilisateur.statut }).from(utilisateur).where(eq(utilisateur.id, employeEquipeId));
    expect(u.statut).toBe("ACTIF");
  }, 60_000);

  test("décision « non retenu » : date de départ posée et compte désactivé ; un CDD exige une date de fin ; un non-stagiaire est refusé", async () => {
    const cdd = await avecEntreprise(entrepriseId, (tx) => deciderStagePro(tx, entrepriseId, dossierHorsEquipeId, { decision: "EMBAUCHE", typeContrat: "CDD" }, new Date("2026-11-01")));
    expect(cdd.erreur).toContain("CDD");
    expect((await avecEntreprise(entrepriseId, (tx) => deciderStagePro(tx, entrepriseId, dossierProId, { decision: "EMBAUCHE", typeContrat: "CDI" }, new Date()))).erreur).toBeDefined(); // plus un stage

    expect(await avecEntreprise(entrepriseId, (tx) => deciderStagePro(tx, entrepriseId, dossierHorsEquipeId, { decision: "NON_RETENU" }, new Date("2026-11-01"), "Ne convient pas"))).toEqual({});
    const d = await dossier(dossierHorsEquipeId);
    expect(d.decisionStage).toBe("NON_RETENU");
    expect(d.dateDepart).toBeInstanceOf(Date);
    const [u] = await db.select({ statut: utilisateur.statut }).from(utilisateur).where(eq(utilisateur.id, employeHorsEquipeId));
    expect(u.statut).toBe("DESACTIVE");
  }, 60_000);

  test("une décision ne s'applique jamais au dossier d'une autre entreprise", async () => {
    const r = await avecEntreprise(autreEntrepriseId, (tx) => deciderStagePro(tx, autreEntrepriseId, dossierProId, { decision: "NON_RETENU" }, new Date()));
    expect(r.erreur).toBe("Dossier RH introuvable.");
  }, 60_000);

  test("fiche académique : l'indemnité est ignorée si l'auteur n'est pas Administrateur, et masquée à la lecture pour un Manager", async () => {
    const parManager = await avecEntreprise(entrepriseId, (tx) => creerStagiaireAcademique(tx, manager(), saisie({ nom: "Étudiant du manager", maitreStageId: managerId })));
    expect(parManager.id).toBeDefined();
    const parAdmin = await avecEntreprise(entrepriseId, (tx) => creerStagiaireAcademique(tx, admin(), saisie({ nom: "Étudiant de l'admin", maitreStageId: adminId })));

    const vueAdmin = await avecEntreprise(entrepriseId, (tx) => listerStagiairesAcademiques(tx, admin()));
    expect(vueAdmin.find((f) => f.id === parManager.id)?.indemniteMensuelle).toBeNull(); // le Manager n'a pas pu la fixer
    expect(vueAdmin.find((f) => f.id === parAdmin.id)?.indemniteMensuelle).toBe(50000);

    const vueManager = await avecEntreprise(entrepriseId, (tx) => listerStagiairesAcademiques(tx, manager()));
    expect(vueManager.map((f) => f.id)).toEqual([parManager.id]); // la fiche de l'admin (autre maître de stage, autre créateur) n'est pas visible
    const fiche = await avecEntreprise(entrepriseId, (tx) => trouverStagiaireAcademique(tx, manager(), parAdmin.id!));
    expect(fiche).toBeNull();
    expect(JSON.stringify(vueManager)).not.toContain("50000");
  }, 60_000);

  test("un Manager voit les fiches dont le maître de stage est dans son équipe ; un Employé n'en voit aucune ; une autre entreprise non plus", async () => {
    const f = await avecEntreprise(entrepriseId, (tx) => creerStagiaireAcademique(tx, admin(), saisie({ nom: "Étudiant équipe", maitreStageId: employeEquipeId })));
    expect((await avecEntreprise(entrepriseId, (tx) => listerStagiairesAcademiques(tx, manager()))).some((x) => x.id === f.id)).toBe(true);
    expect(await avecEntreprise(entrepriseId, (tx) => listerStagiairesAcademiques(tx, employe()))).toEqual([]);
    const autre: UtilisateurConnecte = { entrepriseId: autreEntrepriseId, utilisateurId: autreAdminId, role: "ADMIN" };
    expect(await avecEntreprise(autreEntrepriseId, (tx) => listerStagiairesAcademiques(tx, autre))).toEqual([]);
    expect(await avecEntreprise(autreEntrepriseId, (tx) => trouverStagiaireAcademique(tx, autre, f.id!))).toBeNull();
  }, 60_000);

  test("références et dates validées : maître de stage d'une autre entreprise refusé, fin avant début refusée", async () => {
    expect((await avecEntreprise(entrepriseId, (tx) => creerStagiaireAcademique(tx, admin(), saisie({ maitreStageId: autreAdminId })))).erreur).toBe("Maître de stage introuvable.");
    expect((await avecEntreprise(entrepriseId, (tx) => creerStagiaireAcademique(tx, admin(), saisie({ dateDebut: new Date("2026-09-30"), dateFin: new Date("2026-07-01") })))).erreur).toContain("précéder");
  }, 60_000);

  test("clôture, puis fiche verrouillée ; embauche : invitation créée une seule fois ; fiche embauchée non supprimable", async () => {
    const a = await avecEntreprise(entrepriseId, (tx) => creerStagiaireAcademique(tx, admin(), saisie({ nom: "Étudiant clos" })));
    expect(await avecEntreprise(entrepriseId, (tx) => cloturerStagiaireAcademique(tx, admin(), a.id!, "TERMINE", "Bon travail", "Fin normale"))).toEqual({});
    const [clos] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(stagiaireAcademique).where(eq(stagiaireAcademique.id, a.id!)));
    expect(clos.statut).toBe("TERMINE");
    expect(clos.evaluation).toBe("Bon travail");
    expect((await avecEntreprise(entrepriseId, (tx) => modifierStagiaireAcademique(tx, admin(), a.id!, saisie()))).erreur).toContain("clos");
    expect((await avecEntreprise(entrepriseId, (tx) => cloturerStagiaireAcademique(tx, admin(), a.id!, "INTERROMPU"))).erreur).toBeDefined();

    const b = await avecEntreprise(entrepriseId, (tx) => creerStagiaireAcademique(tx, admin(), saisie({ nom: "Étudiant pris", email: "pris@exemple.test", mission: "Assistant comptable" })));
    const emb = await avecEntreprise(entrepriseId, (tx) => convertirStagiaireEnInvitation(tx, entrepriseId, b.id!, "EMPLOYE", "STAGE", new Date("2026-11-03")));
    expect(emb.jeton).toMatch(/^[A-Za-z0-9]{32}$/);
    const [inv] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(invitation).where(eq(invitation.jeton, emb.jeton!)));
    expect(inv.email).toBe("pris@exemple.test");
    expect(inv.typeContratPropose).toBe("STAGE");
    expect(inv.postePropose).toBe("Assistant comptable");
    expect((await avecEntreprise(entrepriseId, (tx) => convertirStagiaireEnInvitation(tx, entrepriseId, b.id!, "EMPLOYE", "CDI", new Date()))).erreur).toContain("déjà");
    expect((await avecEntreprise(entrepriseId, (tx) => supprimerStagiaireAcademique(tx, entrepriseId, b.id!))).erreur).toContain("embauché");

    const sansEmail = await avecEntreprise(entrepriseId, (tx) => creerStagiaireAcademique(tx, admin(), saisie({ nom: "Sans email", email: undefined })));
    expect((await avecEntreprise(entrepriseId, (tx) => convertirStagiaireEnInvitation(tx, entrepriseId, sansEmail.id!, "EMPLOYE", "CDI", new Date()))).erreur).toContain("email");
    expect(await avecEntreprise(entrepriseId, (tx) => supprimerStagiaireAcademique(tx, entrepriseId, sansEmail.id!))).toEqual({});
  }, 90_000);
});

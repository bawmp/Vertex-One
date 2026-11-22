import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { compte, dossierRH, entreprise, groupe, session, transfertEmploye, utilisateur } from "@/db/schema";
import { accepterTransfert, annulerTransfert, entreprisesDuGroupe, listerTransferts, personnesTransferables, proposerTransfert, refuserTransfert } from "@/lib/rh/transfert";
import { emailArchive, roleTransferable, validerTexteTransfert } from "@/lib/rh/transfert-regles";
import { gabaritTransfertPersonne, gabaritTransfertPropose } from "@/lib/rh/transfert-email";
import type { UtilisateurConnecte } from "@/lib/session";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Transfert d'un employé entre deux entreprises du même groupe : proposé par l'origine, accepté par l'accueil, atomique, historique laissé en place. */
describe("Transfert d'employé — règles pures", () => {
  test("rôles transférables, texte libre borné, adresse d'archive jamais joignable ; emails échappés", () => {
    expect(roleTransferable("EMPLOYE")).toBe(true);
    expect(roleTransferable("MANAGER")).toBe(true);
    for (const r of ["ADMIN", "CLIENT", "COMPTABLE"]) expect(roleTransferable(r)).toBe(false);
    expect(validerTexteTransfert("  Mutation demandée ")).toEqual({ ok: true, texte: "Mutation demandée" });
    expect(validerTexteTransfert("   ")).toEqual({ ok: true, texte: null });
    expect(validerTexteTransfert("x".repeat(501)).ok).toBe(false);
    expect(emailArchive("abc")).toBe("transfere-abc@archive.vertexone.invalid");

    const { html } = gabaritTransfertPropose({ personne: "Awa <b>", poste: "Caissière", origine: "Filiale <i>A</i>", propose: "Alice", message: "<script>x</script>", base: "https://exemple.test/" });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain('href="https://exemple.test/app/rh/transferts"');
    expect(gabaritTransfertPersonne({ nom: "Awa", accueil: "B", origine: "A", base: "https://exemple.test" }).html).toContain("même adresse et le même mot de passe");
  });
});

describe("Transfert d'employé — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const noms = { A: `TEST Transfert A ${suffixe}`, B: `TEST Transfert B ${suffixe}`, C: `TEST Transfert C ${suffixe}` };
  const ent: Record<string, string> = {};
  const id: Record<string, string> = {};
  let groupeId = "";
  const sess = (cle: string, role: "ADMIN" | "MANAGER" | "EMPLOYE", e: string) => ({ utilisateurId: id[cle], entrepriseId: ent[e], role, modulesAutorises: null }) as unknown as UtilisateurConnecte;
  const emailAwa = `tr-awa-${suffixe}@vertexone.test`;

  beforeAll(async () => {
    const [g] = await db.insert(groupe).values({ nom: `TEST Groupe ${suffixe}` }).returning({ id: groupe.id });
    groupeId = g.id;
    for (const [cle, nom] of Object.entries(noms)) {
      // A et B partagent un groupe ; C est une entreprise sans lien.
      const [e] = await db.insert(entreprise).values({ nom, secteurProfil: "agence", groupeId: cle === "C" ? null : groupeId }).returning({ id: entreprise.id });
      ent[cle] = e.id;
    }
    const personne = async (cle: string, e: string, role: "ADMIN" | "MANAGER" | "EMPLOYE", opts: { managerId?: string; email?: string; dossier?: boolean } = {}) => {
      const [x] = await db.insert(utilisateur).values({ entrepriseId: ent[e], email: opts.email ?? `tr-${cle}-${suffixe}@vertexone.test`, nomComplet: `Personne ${cle}`, role, managerId: opts.managerId ?? null }).returning({ id: utilisateur.id });
      id[cle] = x.id;
      if (opts.dossier !== false) {
        await avecEntreprise(ent[e], (tx) =>
          tx.insert(dossierRH).values({ entrepriseId: ent[e], utilisateurId: x.id, poste: "Caissière", typeContrat: "CDI", dateEmbauche: new Date("2023-02-01"), dateNaissance: "1995-04-12", telephone: "690111222", adresse: "Akwa, Douala", salaireBase: 150000, soldeConges: 12, nombrePersonnesACharge: 2 }),
        );
      }
    };
    await personne("adminA", "A", "ADMIN");
    await personne("adminB", "B", "ADMIN");
    await personne("managerB", "B", "MANAGER");
    await personne("chefA", "A", "MANAGER");
    await personne("awa", "A", "EMPLOYE", { managerId: undefined, email: emailAwa });
    await personne("adjointA", "A", "EMPLOYE");
    await personne("sansFiche", "A", "EMPLOYE", { dossier: false });
    await personne("employeB", "B", "EMPLOYE");
    await personne("adminC", "C", "ADMIN");
    // Awa dirige un collègue ; son compte porte un mot de passe et une session.
    await db.update(utilisateur).set({ managerId: id.awa }).where(eq(utilisateur.id, id.adjointA));
    await db.update(utilisateur).set({ managerId: id.chefA }).where(eq(utilisateur.id, id.awa));
    await db.insert(compte).values({ providerId: "credential", issuer: "better-auth", accountId: id.awa, userId: id.awa, password: "hash-de-test" });
    await db.insert(session).values({ userId: id.awa, token: `jeton-${suffixe}`, expiresAt: new Date(Date.now() + 3_600_000) });
  }, 240_000);

  afterAll(async () => {
    for (const nom of Object.values(noms)) await supprimerEntrepriseDeTest(nom);
    await db.delete(groupe).where(eq(groupe.id, groupeId));
  }, 300_000);

  const proposer = (u: UtilisateurConnecte, personne: string, cible: string, message = "Mutation demandée") => proposerTransfert(u, personne, cible, message);

  test("seul un Administrateur propose ; destination du même groupe ; Employés et Managers actifs avec fiche, jamais soi-même ni un Administrateur", async () => {
    expect((await proposer(sess("chefA", "MANAGER", "A"), id.awa, ent.B)).ok).toBe(false); // un manager ne propose pas
    expect((await proposer(sess("adminA", "ADMIN", "A"), id.awa, ent.C)).ok).toBe(false); // autre groupe
    expect((await proposer(sess("adminA", "ADMIN", "A"), id.awa, ent.A)).ok).toBe(false); // sa propre entreprise
    expect((await proposer(sess("adminA", "ADMIN", "A"), id.adminA, ent.B)).ok).toBe(false); // soi-même / Administrateur
    expect((await proposer(sess("adminA", "ADMIN", "A"), id.employeB, ent.B)).ok).toBe(false); // personne d'une autre entreprise
    expect((await proposer(sess("adminA", "ADMIN", "A"), id.sansFiche, ent.B)).ok).toBe(false); // pas de fiche RH
    expect((await proposer(sess("adminA", "ADMIN", "A"), id.awa, ent.B, "x".repeat(501))).ok).toBe(false);
    expect((await entreprisesDuGroupe(ent.A)).map((e) => e.id)).toEqual([ent.B]);
    const possibles = await avecEntreprise(ent.A, (tx) => personnesTransferables(tx, sess("adminA", "ADMIN", "A")));
    expect(possibles.map((p) => p.id).sort()).toEqual([id.awa, id.adjointA, id.chefA].sort());
    expect(await avecEntreprise(ent.A, (tx) => personnesTransferables(tx, sess("chefA", "MANAGER", "A")))).toEqual([]);
  }, 180_000);

  test("proposition : deux lignes miroir, l'accueil voit la demande, rien n'a bougé, un seul transfert en attente par personne", async () => {
    const r = await proposer(sess("adminA", "ADMIN", "A"), id.awa, ent.B);
    expect(r.ok).toBe(true);
    expect(r.ok && r.courriers.map((c) => c.to)).toContain(`tr-adminB-${suffixe}@vertexone.test`);
    expect((await proposer(sess("adminA", "ADMIN", "A"), id.awa, ent.B)).ok).toBe(false);

    const sortants = await avecEntreprise(ent.A, (tx) => listerTransferts(tx, sess("adminA", "ADMIN", "A")));
    const entrants = await avecEntreprise(ent.B, (tx) => listerTransferts(tx, sess("adminB", "ADMIN", "B")));
    expect(sortants).toHaveLength(1);
    expect(entrants).toHaveLength(1);
    expect(sortants[0]).toMatchObject({ sens: "SORTANT", statut: "EN_ATTENTE", nomPersonne: "Personne awa", nomEntrepriseCible: noms.B });
    expect(entrants[0]).toMatchObject({ sens: "ENTRANT", statut: "EN_ATTENTE", nomEntrepriseSource: noms.A, poste: "Caissière" });
    expect(sortants[0].transfertId).toBe(entrants[0].transfertId);
    // l'entreprise sans lien ne voit rien, un manager non plus
    expect(await avecEntreprise(ent.C, (tx) => listerTransferts(tx, sess("adminC", "ADMIN", "C")))).toEqual([]);
    expect(await avecEntreprise(ent.B, (tx) => listerTransferts(tx, sess("managerB", "MANAGER", "B")))).toEqual([]);
    const [awa] = await db.select({ statut: utilisateur.statut, entrepriseId: utilisateur.entrepriseId }).from(utilisateur).where(eq(utilisateur.id, id.awa));
    expect(awa).toEqual({ statut: "ACTIF", entrepriseId: ent.A });
  }, 180_000);

  test("seul l'Administrateur d'accueil répond : ni l'origine, ni un manager, ni une autre entreprise", async () => {
    const [entrant] = await avecEntreprise(ent.B, (tx) => listerTransferts(tx, sess("adminB", "ADMIN", "B")));
    const [sortant] = await avecEntreprise(ent.A, (tx) => listerTransferts(tx, sess("adminA", "ADMIN", "A")));
    expect((await accepterTransfert(sess("managerB", "MANAGER", "B"), entrant.id, null)).ok).toBe(false);
    expect((await accepterTransfert(sess("adminA", "ADMIN", "A"), sortant.id, null)).ok).toBe(false); // la ligne SORTANT n'est pas une demande à accepter
    expect((await accepterTransfert(sess("adminA", "ADMIN", "A"), entrant.id, null)).ok).toBe(false); // ligne d'une autre entreprise
    expect((await accepterTransfert(sess("adminC", "ADMIN", "C"), entrant.id, null)).ok).toBe(false);
    expect((await refuserTransfert(sess("adminC", "ADMIN", "C"), entrant.id, "")).ok).toBe(false);
    expect((await annulerTransfert(sess("adminB", "ADMIN", "B"), entrant.id)).ok).toBe(false); // l'accueil n'annule pas, il refuse
    expect((await accepterTransfert(sess("adminB", "ADMIN", "B"), entrant.id, id.employeB)).ok).toBe(false); // responsable : un Employé n'est pas un responsable valable
    expect((await accepterTransfert(sess("adminB", "ADMIN", "B"), entrant.id, id.adminA)).ok).toBe(false); // responsable d'une autre entreprise
  }, 180_000);

  test("acceptation : le compte déménage (même adresse, même mot de passe), la fiche suit sans le salaire, l'historique reste, l'équipe remonte", async () => {
    const [entrant] = await avecEntreprise(ent.B, (tx) => listerTransferts(tx, sess("adminB", "ADMIN", "B")));
    const r = await accepterTransfert(sess("adminB", "ADMIN", "B"), entrant.id, id.managerB);
    expect(r.ok).toBe(true);
    expect(r.ok && r.courriers.map((c) => c.to)).toContain(emailAwa); // la personne est prévenue

    // Ancien compte : archivé chez l'origine, adresse libérée.
    const [ancien] = await db.select().from(utilisateur).where(eq(utilisateur.id, id.awa));
    expect(ancien).toMatchObject({ entrepriseId: ent.A, statut: "DESACTIVE", email: emailArchive(id.awa) });
    // Nouveau compte : chez l'accueil, avec l'adresse, le responsable choisi et le socle de l'Employé.
    const [nouveau] = await db.select().from(utilisateur).where(eq(utilisateur.email, emailAwa));
    expect(nouveau).toMatchObject({ entrepriseId: ent.B, statut: "ACTIF", role: "EMPLOYE", nomComplet: "Personne awa", managerId: id.managerB, serviceId: null });
    expect(nouveau.id).not.toBe(id.awa);
    expect(nouveau.modulesAutorises).toEqual(expect.arrayContaining(["RH", "PROJETS", "MESSAGERIE"]));
    // Mot de passe déplacé, sessions fermées.
    const comptes = await db.select().from(compte).where(eq(compte.userId, nouveau.id));
    expect(comptes).toHaveLength(1);
    expect(comptes[0]).toMatchObject({ password: "hash-de-test", accountId: nouveau.id });
    expect(await db.select().from(compte).where(eq(compte.userId, id.awa))).toHaveLength(0);
    expect(await db.select().from(session).where(eq(session.userId, id.awa))).toHaveLength(0);

    // Fiche d'accueil : liste blanche, jamais le salaire, le solde de congés ni les politiques.
    const [fiche] = await avecEntreprise(ent.B, (tx) => tx.select().from(dossierRH).where(eq(dossierRH.utilisateurId, nouveau.id)));
    expect(fiche).toMatchObject({ entrepriseId: ent.B, poste: "Caissière", typeContrat: "CDI", dateNaissance: "1995-04-12", telephone: "690111222", adresse: "Akwa, Douala", nombrePersonnesACharge: 2, salaireBase: null, soldeConges: 0, politiqueCongeId: null, shiftId: null, dateDepart: null });
    expect(fiche.dateEmbauche.toISOString().slice(0, 10)).toBe("2023-02-01"); // ancienneté du groupe conservée
    // Origine : sa fiche reste (salaire compris), close ; l'accueil ne voit pas l'ancienne.
    const [ancienneFiche] = await avecEntreprise(ent.A, (tx) => tx.select().from(dossierRH).where(eq(dossierRH.utilisateurId, id.awa)));
    expect(ancienneFiche).toMatchObject({ salaireBase: 150000, soldeConges: 12 });
    expect(ancienneFiche.dateDepart).not.toBeNull();
    expect(await avecEntreprise(ent.B, (tx) => tx.select().from(dossierRH).where(eq(dossierRH.utilisateurId, id.awa)))).toHaveLength(0);
    // L'équipe de la personne remonte d'un cran chez l'origine.
    const [adjoint] = await db.select({ managerId: utilisateur.managerId }).from(utilisateur).where(eq(utilisateur.id, id.adjointA));
    expect(adjoint.managerId).toBe(id.chefA);

    // Les deux lignes sont closes et reliées au nouveau compte.
    const [s] = await avecEntreprise(ent.A, (tx) => listerTransferts(tx, sess("adminA", "ADMIN", "A")));
    const [e] = await avecEntreprise(ent.B, (tx) => listerTransferts(tx, sess("adminB", "ADMIN", "B")));
    expect(s).toMatchObject({ statut: "ACCEPTE", nouvelUtilisateurId: nouveau.id });
    expect(e).toMatchObject({ statut: "ACCEPTE", nouvelUtilisateurId: nouveau.id });

    // Pas de deuxième acceptation, et la personne n'est plus proposable depuis l'origine.
    expect((await accepterTransfert(sess("adminB", "ADMIN", "B"), entrant.id, null)).ok).toBe(false);
    expect((await proposer(sess("adminA", "ADMIN", "A"), id.awa, ent.B)).ok).toBe(false);
  }, 240_000);

  test("refus et annulation : rien ne bouge, la personne reste en place ; transfert impossible si le groupe a changé", async () => {
    expect((await proposer(sess("adminA", "ADMIN", "A"), id.adjointA, ent.B)).ok).toBe(true);
    const [entrant] = (await avecEntreprise(ent.B, (tx) => listerTransferts(tx, sess("adminB", "ADMIN", "B")))).filter((l) => l.statut === "EN_ATTENTE");
    const refus = await refuserTransfert(sess("adminB", "ADMIN", "B"), entrant.id, "Pas de poste disponible");
    expect(refus.ok && refus.courriers.map((c) => c.to)).toContain(`tr-adminA-${suffixe}@vertexone.test`);
    const [sortantRefuse] = (await avecEntreprise(ent.A, (tx) => listerTransferts(tx, sess("adminA", "ADMIN", "A")))).filter((l) => l.utilisateurSourceId === id.adjointA);
    expect(sortantRefuse).toMatchObject({ statut: "REFUSE", motifDecision: "Pas de poste disponible" });
    expect((await db.select({ e: utilisateur.entrepriseId, s: utilisateur.statut }).from(utilisateur).where(eq(utilisateur.id, id.adjointA)))[0]).toEqual({ e: ent.A, s: "ACTIF" });

    // Nouvelle proposition, puis annulation par l'origine.
    expect((await proposer(sess("adminA", "ADMIN", "A"), id.adjointA, ent.B)).ok).toBe(true);
    const [encore] = (await avecEntreprise(ent.A, (tx) => listerTransferts(tx, sess("adminA", "ADMIN", "A")))).filter((l) => l.statut === "EN_ATTENTE");
    expect((await annulerTransfert(sess("adminB", "ADMIN", "B"), encore.id)).ok).toBe(false);
    expect((await annulerTransfert(sess("adminA", "ADMIN", "A"), encore.id)).ok).toBe(true);
    expect((await avecEntreprise(ent.B, (tx) => listerTransferts(tx, sess("adminB", "ADMIN", "B")))).filter((l) => l.statut === "EN_ATTENTE")).toHaveLength(0);

    // Une proposition en attente ne s'exécute plus si les entreprises ne sont plus dans le même groupe.
    expect((await proposer(sess("adminA", "ADMIN", "A"), id.adjointA, ent.B)).ok).toBe(true);
    const [attente] = (await avecEntreprise(ent.B, (tx) => listerTransferts(tx, sess("adminB", "ADMIN", "B")))).filter((l) => l.statut === "EN_ATTENTE");
    await db.update(entreprise).set({ groupeId: null }).where(eq(entreprise.id, ent.B));
    expect((await accepterTransfert(sess("adminB", "ADMIN", "B"), attente.id, null)).ok).toBe(false);
    await db.update(entreprise).set({ groupeId }).where(eq(entreprise.id, ent.B));
    // Personne désactivée entre-temps : impossible.
    await db.update(utilisateur).set({ statut: "DESACTIVE" }).where(eq(utilisateur.id, id.adjointA));
    expect((await accepterTransfert(sess("adminB", "ADMIN", "B"), attente.id, null)).ok).toBe(false);
    expect((await db.select({ e: utilisateur.entrepriseId }).from(utilisateur).where(eq(utilisateur.id, id.adjointA)))[0].e).toBe(ent.A);
  }, 300_000);

  test("fuite : la base masque les demandes d'une entreprise à l'autre", async () => {
    expect(await avecEntreprise(ent.C, (tx) => tx.select({ id: transfertEmploye.id }).from(transfertEmploye))).toHaveLength(0);
    const chezA = await avecEntreprise(ent.A, (tx) => tx.select({ sens: transfertEmploye.sens }).from(transfertEmploye));
    expect(chezA.every((l) => l.sens === "SORTANT")).toBe(true);
    const chezB = await avecEntreprise(ent.B, (tx) => tx.select({ sens: transfertEmploye.sens }).from(transfertEmploye));
    expect(chezB.every((l) => l.sens === "ENTRANT")).toBe(true);
  }, 120_000);
});

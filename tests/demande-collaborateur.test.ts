import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { demandeCollaborateur, entreprise, invitation, utilisateur } from "@/db/schema";
import { annulerDemande, compterDemandesEnAttente, confirmerDemande, deposerDemande, lireDemandes, refuserDemande, responsablesDemande } from "@/lib/rh/demande-collaborateur";
import { gabaritDemandeConfirmee, gabaritDemandeDeposee, gabaritDemandeRefusee } from "@/lib/rh/demande-collaborateur-email";
import type { UtilisateurConnecte } from "@/lib/session";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Un Manager demande l'ajout d'un collaborateur ; l'Administrateur confirme (en corrigeant au besoin) ou refuse ; aucune invitation avant. Jamais de salaire. */
describe("Demande de fiche — emails", () => {
  test("les messages échappent ce qui a été saisi et ne parlent jamais de salaire chiffré", () => {
    const { html } = gabaritDemandeDeposee({ manager: "Marc <b>", poste: "Caissier <script>x</script>", contrat: "CDI", email: "a@b.test", base: "https://exemple.test/" });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain('href="https://exemple.test/app/rh/a-confirmer"');
    expect(gabaritDemandeRefusee({ poste: "X", email: "a@b.test", motif: "<i>non</i>", base: "https://exemple.test" }).html).not.toContain("<i>");
    expect(gabaritDemandeConfirmee({ poste: "X", email: "a@b.test", base: "https://exemple.test" }).sujet).toContain("confirmée");
  });
});

describe("Demande de fiche — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const noms = { A: `TEST Demande A ${suffixe}`, B: `TEST Demande B ${suffixe}` };
  const ent: Record<string, string> = {};
  const id: Record<string, string> = {};
  const sess = (cle: string, role: "ADMIN" | "MANAGER" | "EMPLOYE", e: string) => ({ utilisateurId: id[cle], entrepriseId: ent[e], role, modulesAutorises: null }) as unknown as UtilisateurConnecte;
  const saisie = (email: string) => ({ email, poste: "Assistant commercial", typeContrat: "CDD", dateEmbauche: "2026-12-01", dateFin: "2027-06-01", dateNaissance: "1999-04-20" });
  const courriel = (n: string) => `dc-${n}-${suffixe}@vertexone.test`;

  beforeAll(async () => {
    for (const [cle, nom] of Object.entries(noms)) {
      const [e] = await db.insert(entreprise).values({ nom, secteurProfil: "agence" }).returning({ id: entreprise.id });
      ent[cle] = e.id;
    }
    const personne = async (cle: string, e: string, role: "ADMIN" | "MANAGER" | "EMPLOYE") => {
      const [x] = await db.insert(utilisateur).values({ entrepriseId: ent[e], email: courriel(cle), nomComplet: `Personne ${cle}`, role }).returning({ id: utilisateur.id });
      id[cle] = x.id;
    };
    await personne("adminA", "A", "ADMIN");
    await personne("managerA", "A", "MANAGER");
    await personne("autreManagerA", "A", "MANAGER");
    await personne("employeA", "A", "EMPLOYE");
    await personne("adminB", "B", "ADMIN");
  }, 180_000);

  afterAll(async () => {
    for (const nom of Object.values(noms)) await supprimerEntrepriseDeTest(nom);
  }, 240_000);

  const deposer = (u: UtilisateurConnecte, email: string, s = saisie(email)) => avecEntreprise(u.entrepriseId, (tx) => deposerDemande(tx, u, s));

  test("seul un Manager dépose ; rien n'est créé (ni invitation ni compte) ; l'Administrateur est prévenu ; pas de doublon ni d'adresse déjà utilisée", async () => {
    expect((await deposer(sess("employeA", "EMPLOYE", "A"), courriel("n1"))).ok).toBe(false);
    expect((await deposer(sess("adminA", "ADMIN", "A"), courriel("n1"))).ok).toBe(false); // l'Administrateur crée directement, il ne dépose pas de demande
    const r = await deposer(sess("managerA", "MANAGER", "A"), courriel("n1"));
    expect(r.ok).toBe(true);
    expect(r.ok && r.courriers.map((c) => c.to)).toEqual([courriel("adminA")]);
    expect(await avecEntreprise(ent.A, (tx) => tx.select().from(invitation).where(eq(invitation.email, courriel("n1"))))).toHaveLength(0);
    expect(await db.select().from(utilisateur).where(eq(utilisateur.email, courriel("n1")))).toHaveLength(0);
    const [d] = await avecEntreprise(ent.A, (tx) => tx.select().from(demandeCollaborateur).where(eq(demandeCollaborateur.email, courriel("n1"))));
    expect(d).toMatchObject({ statut: "EN_ATTENTE", demandeParId: id.managerA, responsableId: id.managerA, typeContrat: "CDD", poste: "Assistant commercial" });
    expect(Object.keys(d)).not.toContain("salaire");
    expect((await deposer(sess("managerA", "MANAGER", "A"), courriel("n1"))).ok).toBe(false); // déjà en attente
    expect((await deposer(sess("managerA", "MANAGER", "A"), courriel("employeA"))).ok).toBe(false); // l'adresse a déjà un compte
    expect((await deposer(sess("managerA", "MANAGER", "A"), courriel("n2"), { ...saisie(courriel("n2")), dateFin: "" })).ok).toBe(false); // un CDD a une fin
  }, 180_000);

  test("visibilité : l'Administrateur voit tout, un Manager seulement ses demandes, un Employé et une autre entreprise rien", async () => {
    expect((await deposer(sess("autreManagerA", "MANAGER", "A"), courriel("n3"))).ok).toBe(true);
    const lire = (u: UtilisateurConnecte) => avecEntreprise(u.entrepriseId, (tx) => lireDemandes(tx, u));
    expect((await lire(sess("adminA", "ADMIN", "A"))).map((d) => d.email).sort()).toEqual([courriel("n1"), courriel("n3")].sort());
    expect((await lire(sess("managerA", "MANAGER", "A"))).map((d) => d.email)).toEqual([courriel("n1")]);
    expect(await lire(sess("employeA", "EMPLOYE", "A"))).toEqual([]);
    expect(await lire(sess("adminB", "ADMIN", "B"))).toEqual([]);
    expect(await avecEntreprise(ent.B, (tx) => tx.select({ id: demandeCollaborateur.id }).from(demandeCollaborateur))).toHaveLength(0);
    expect(await avecEntreprise(ent.A, (tx) => compterDemandesEnAttente(tx, sess("adminA", "ADMIN", "A")))).toBe(2);
    expect(await avecEntreprise(ent.A, (tx) => compterDemandesEnAttente(tx, sess("managerA", "MANAGER", "A")))).toBe(0);
    expect(await avecEntreprise(ent.A, (tx) => responsablesDemande(tx, sess("managerA", "MANAGER", "A")))).toEqual([]);
  }, 180_000);

  test("confirmation : réservée à l'Administrateur de la même entreprise ; elle crée l'invitation (corrections prises en compte) et prévient le Manager", async () => {
    const [d] = await avecEntreprise(ent.A, (tx) => tx.select().from(demandeCollaborateur).where(eq(demandeCollaborateur.email, courriel("n1"))));
    const corrections = { poste: "Responsable boutique", typeContrat: "CDI", dateEmbauche: "2026-12-15", dateFin: "", dateNaissance: "1999-04-20" };
    const confirmer = (u: UtilisateurConnecte, responsable = "") => avecEntreprise(u.entrepriseId, (tx) => confirmerDemande(tx, u, d.id, corrections, responsable));
    expect((await confirmer(sess("managerA", "MANAGER", "A"))).ok).toBe(false); // ni le Manager demandeur...
    expect((await confirmer(sess("autreManagerA", "MANAGER", "A"))).ok).toBe(false); // ...ni un autre
    expect((await confirmer(sess("adminB", "ADMIN", "B"))).ok).toBe(false); // ni une autre entreprise
    expect((await confirmer(sess("adminA", "ADMIN", "A"), id.adminB)).ok).toBe(false); // responsable d'une autre entreprise
    expect(await avecEntreprise(ent.A, (tx) => tx.select().from(invitation).where(eq(invitation.email, courriel("n1"))))).toHaveLength(0); // rien n'a bougé

    const r = await confirmer(sess("adminA", "ADMIN", "A"), id.autreManagerA);
    expect(r.ok).toBe(true);
    expect(r.ok && r.courriers.map((c) => c.to)).toEqual([courriel("managerA")]);
    const [inv] = await avecEntreprise(ent.A, (tx) => tx.select().from(invitation).where(eq(invitation.email, courriel("n1"))));
    expect(inv).toMatchObject({ roleProposee: "EMPLOYE", postePropose: "Responsable boutique", typeContratPropose: "CDI", managerPropose: id.autreManagerA, dateNaissancePropose: "1999-04-20" });
    expect(inv.dateFinPropose).toBeNull();
    expect(r.ok && r.jeton).toBe(inv.jeton);
    const [apres] = await avecEntreprise(ent.A, (tx) => tx.select().from(demandeCollaborateur).where(eq(demandeCollaborateur.id, d.id)));
    expect(apres).toMatchObject({ statut: "CONFIRMEE", decideParId: id.adminA, invitationId: inv.id, poste: "Responsable boutique" });
    expect((await confirmer(sess("adminA", "ADMIN", "A"))).ok).toBe(false); // une seule réponse par demande
  }, 180_000);

  test("refus (motif transmis), retrait par le Manager, corrections invalides ; la base masque les demandes d'une entreprise à l'autre", async () => {
    const [d3] = await avecEntreprise(ent.A, (tx) => tx.select().from(demandeCollaborateur).where(eq(demandeCollaborateur.email, courriel("n3"))));
    expect((await avecEntreprise(ent.A, (tx) => confirmerDemande(tx, sess("adminA", "ADMIN", "A"), d3.id, { poste: "x", typeContrat: "CDD", dateEmbauche: "2026-12-15", dateFin: "", dateNaissance: "" }, ""))).ok).toBe(false); // poste trop court, fin manquante
    expect((await avecEntreprise(ent.A, (tx) => refuserDemande(tx, sess("autreManagerA", "MANAGER", "A"), d3.id, "non"))).ok).toBe(false);
    expect((await avecEntreprise(ent.B, (tx) => refuserDemande(tx, sess("adminB", "ADMIN", "B"), d3.id, "non"))).ok).toBe(false); // demande d'une autre entreprise : introuvable
    const refus = await avecEntreprise(ent.A, (tx) => refuserDemande(tx, sess("adminA", "ADMIN", "A"), d3.id, "Pas de budget"));
    expect(refus.ok && refus.courriers.map((c) => c.to)).toEqual([courriel("autreManagerA")]);
    const [ferme] = await avecEntreprise(ent.A, (tx) => tx.select().from(demandeCollaborateur).where(eq(demandeCollaborateur.id, d3.id)));
    expect(ferme).toMatchObject({ statut: "REFUSEE", motifRefus: "Pas de budget" });
    expect(await avecEntreprise(ent.A, (tx) => tx.select().from(invitation).where(eq(invitation.email, courriel("n3"))))).toHaveLength(0);

    // Retrait : par son auteur seulement, tant qu'elle est en attente.
    expect((await deposer(sess("managerA", "MANAGER", "A"), courriel("n4"))).ok).toBe(true);
    const [d4] = await avecEntreprise(ent.A, (tx) => tx.select().from(demandeCollaborateur).where(and(eq(demandeCollaborateur.email, courriel("n4")))));
    expect((await avecEntreprise(ent.A, (tx) => annulerDemande(tx, sess("autreManagerA", "MANAGER", "A"), d4.id))).ok).toBe(false);
    expect((await avecEntreprise(ent.A, (tx) => annulerDemande(tx, sess("managerA", "MANAGER", "A"), d4.id))).ok).toBe(true);
    expect((await avecEntreprise(ent.A, (tx) => annulerDemande(tx, sess("managerA", "MANAGER", "A"), d4.id))).ok).toBe(false);
    // Après retrait, la même adresse peut être redemandée.
    expect((await deposer(sess("managerA", "MANAGER", "A"), courriel("n4"))).ok).toBe(true);
  }, 240_000);
});

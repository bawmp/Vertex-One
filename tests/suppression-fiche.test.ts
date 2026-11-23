import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import {
  entreprise,
  utilisateur,
  session,
  compte,
  dossierRH,
  demandeConge,
  evaluation,
  documentRH,
  mission,
  tachePoste,
  notePersonnelle,
  paiementSalaire,
  stagiaireAcademique,
  invitation,
} from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock("@/lib/i18n/langue", () => ({ getT: async () => (texte: string, v?: Record<string, string | number>) => (v ? texte.replace(/\{(\w+)\}/g, (b, k: string) => String(v[k] ?? b)) : texte) }));
// Aucun fichier réel n'est touché : on note seulement les clés que le code demande d'effacer.
const effaces: string[] = [];
vi.mock("@/lib/documents/stockage", () => ({ effacerObjetStockage: async (cle: string) => { effaces.push(cle); return true; } }));

let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

const { supprimerFicheCollaborateurAction } = await import("@/lib/actions/suppression-fiche");

/**
 * « Supprimer la fiche » d'un collaborateur : effacement définitif de la fiche RH et de ses données personnelles, accès retiré, nom gardé pour
 * l'historique ; refusé si un salaire a déjà été payé, pour soi-même, pour un autre Administrateur, ou depuis une autre entreprise.
 */
const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Fiche A ${suffixe}`;
const nomB = `TEST Fiche B ${suffixe}`;
let a = "", b = "";
let adminA = "", adminA2 = "", managerA = "", employeA = "", subordonne = "", employePaye = "", employeSansFiche = "", adminB = "", employeB = "";
let dossierEmploye = "", dossierPaye = "", dossierB = "", stagiaireEmbauche = "";

const creerUtilisateur = async (entrepriseId: string, prefixe: string, role: "ADMIN" | "MANAGER" | "EMPLOYE", managerId?: string, extra: Partial<typeof utilisateur.$inferInsert> = {}) =>
  (await db.insert(utilisateur).values({ entrepriseId, email: `${prefixe}-${suffixe}@vertexone.test`, nomComplet: prefixe, role, managerId, ...extra }).returning({ id: utilisateur.id }))[0].id;
// Table à RLS stricte : jamais d'insertion hors d'avecEntreprise().
const creerDossier = (entrepriseId: string, utilisateurId: string) =>
  avecEntreprise(entrepriseId, async (tx) => (await tx.insert(dossierRH).values({ entrepriseId, utilisateurId, poste: "Poste test", typeContrat: "CDI", dateEmbauche: new Date(), telephone: "690000000", adresse: "Rue test", salaireBase: 150000 }).returning({ id: dossierRH.id }))[0].id);

beforeAll(async () => {
  [{ id: a }] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "generique" }).returning({ id: entreprise.id });
  [{ id: b }] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "generique" }).returning({ id: entreprise.id });
  adminA = await creerUtilisateur(a, "admin-a", "ADMIN");
  adminA2 = await creerUtilisateur(a, "admin-a2", "ADMIN");
  managerA = await creerUtilisateur(a, "manager-a", "MANAGER", undefined, { photoCleStockage: `${a}/photos/manager.png` });
  subordonne = await creerUtilisateur(a, "subordonne-a", "EMPLOYE", managerA);
  employeA = await creerUtilisateur(a, "employe-a", "EMPLOYE");
  employePaye = await creerUtilisateur(a, "employe-paye-a", "EMPLOYE");
  employeSansFiche = await creerUtilisateur(a, "employe-sans-fiche-a", "EMPLOYE");
  adminB = await creerUtilisateur(b, "admin-b", "ADMIN");
  employeB = await creerUtilisateur(b, "employe-b", "EMPLOYE");

  dossierEmploye = await creerDossier(a, employeA);
  dossierPaye = await creerDossier(a, employePaye);
  dossierB = await creerDossier(b, employeB);
  await creerDossier(a, managerA);

  await avecEntreprise(a, async (tx) => {
    await tx.insert(demandeConge).values({ entrepriseId: a, dossierRHId: dossierEmploye, type: "CONGE_PAYE", dateDebut: new Date(), dateFin: new Date(), nombreJours: 2 });
    await tx.insert(evaluation).values({ entrepriseId: a, dossierRHId: dossierEmploye, evaluateurId: adminA, periode: "2026-S1", commentaire: "Bien" });
    await tx.insert(documentRH).values({ entrepriseId: a, dossierRHId: dossierEmploye, nom: "contrat.pdf", cleStockage: `${a}/rh/contrat-${suffixe}.pdf`, typeMime: "application/pdf", tailleOctets: 10, televerseParId: adminA });
    await tx.insert(tachePoste).values({ entrepriseId: a, utilisateurId: employeA, titre: "Relancer", creeParId: adminA });
    await tx.insert(mission).values({ entrepriseId: a, utilisateurId: employeA, titre: "Mission test", horizon: "HEBDOMADAIRE", dateDebut: "2026-11-23", dateFin: "2026-11-29", creeParId: adminA });
    await tx.insert(notePersonnelle).values({ entrepriseId: a, utilisateurId: employeA, contenu: "ma note privée" });
    await tx.insert(paiementSalaire).values({ entrepriseId: a, dossierRHId: dossierPaye, mois: "2026-10", salaireBase: 150000, primes: [], totalPrimes: 0, retenues: [], totalRetenues: 0, net: 150000, datePaiement: "2026-10-31", modePaiement: "virement", payeParId: adminA });
    // Un stagiaire embauché : sa fiche de stage est reliée à l'invitation envoyée à l'adresse de l'employé.
    const [inv] = await tx
      .insert(invitation)
      .values({ entrepriseId: a, email: `employe-a-${suffixe}@vertexone.test`, roleProposee: "EMPLOYE", postePropose: "Stagiaire", typeContratPropose: "STAGE", dateEmbauchePropose: new Date(), jeton: `jeton-${suffixe}`, expireLe: new Date(Date.now() + 86_400_000), utiliseeLe: new Date() })
      .returning({ id: invitation.id });
    [{ id: stagiaireEmbauche }] = await tx
      .insert(stagiaireAcademique)
      .values({ entrepriseId: a, nom: "Stagiaire Embauché", etablissement: "Ecole test", dateDebut: new Date(), dateFin: new Date(), creeParId: adminA, statut: "EMBAUCHE", email: `employe-a-${suffixe}@vertexone.test`, invitationId: inv.id, photoCleStockage: `${a}/photos/stagiaire.png` })
      .returning({ id: stagiaireAcademique.id });
  });
  await db.insert(session).values({ token: `tok-${suffixe}`, userId: employeA, expiresAt: new Date(Date.now() + 3600_000) });
  await db.insert(compte).values({ accountId: employeA, providerId: "credential", issuer: "test", userId: employeA, password: "hash" });
}, 180_000);

afterAll(async () => {
  await db.delete(session).where(eq(session.userId, employeA));
  await db.delete(compte).where(eq(compte.userId, employeA));
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 180_000);

const connecter = (entrepriseId: string, utilisateurId: string, role: string) => {
  connecte = { entrepriseId, utilisateurId, role };
};
const lire = async (id: string) => (await db.select().from(utilisateur).where(eq(utilisateur.id, id)))[0];
const compter = (entrepriseId: string, lecture: (tx: Parameters<Parameters<typeof avecEntreprise>[1]>[0]) => Promise<unknown[]>) => avecEntreprise(entrepriseId, async (tx) => (await lecture(tx)).length);

describe("Supprimer la fiche d'un collaborateur", () => {
  test("un Manager ou un Employé ne peut pas supprimer une fiche", async () => {
    for (const [id, role] of [[managerA, "MANAGER"], [subordonne, "EMPLOYE"]] as const) {
      connecter(a, id, role);
      const r = await supprimerFicheCollaborateurAction(employeA);
      expect(r.erreur).toBeTruthy();
    }
    expect((await lire(employeA)).statut).not.toBe("SUPPRIME");
    expect(await compter(a, (tx) => tx.select().from(dossierRH).where(eq(dossierRH.id, dossierEmploye)))).toBe(1);
  });

  test("l'Administrateur ne peut supprimer ni sa propre fiche ni celle d'un autre Administrateur", async () => {
    connecter(a, adminA, "ADMIN");
    expect((await supprimerFicheCollaborateurAction(adminA)).erreur).toBeTruthy();
    expect((await supprimerFicheCollaborateurAction(adminA2)).erreur).toBeTruthy();
    expect((await lire(adminA2)).statut).not.toBe("SUPPRIME");
  });

  test("FUITE ENTRE ENTREPRISES : l'Administrateur d'une autre entreprise ne peut rien supprimer ici", async () => {
    connecter(b, adminB, "ADMIN");
    const r = await supprimerFicheCollaborateurAction(employeA);
    expect(r.erreur).toBeTruthy();
    expect((await lire(employeA)).statut).not.toBe("SUPPRIME");
    expect(await compter(a, (tx) => tx.select().from(dossierRH).where(eq(dossierRH.id, dossierEmploye)))).toBe(1);
    // et inversement, l'administrateur de A ne touche pas à la fiche de B
    connecter(a, adminA, "ADMIN");
    expect((await supprimerFicheCollaborateurAction(employeB)).erreur).toBeTruthy();
    expect(await compter(b, (tx) => tx.select().from(dossierRH).where(eq(dossierRH.id, dossierB)))).toBe(1);
  });

  test("refusée si un salaire a déjà été payé : rien n'est effacé", async () => {
    connecter(a, adminA, "ADMIN");
    const r = await supprimerFicheCollaborateurAction(employePaye);
    expect(r.erreur).toContain("salaire a déjà été payé");
    expect((await lire(employePaye)).statut).not.toBe("SUPPRIME");
    expect(await compter(a, (tx) => tx.select().from(dossierRH).where(eq(dossierRH.id, dossierPaye)))).toBe(1);
    expect(await compter(a, (tx) => tx.select().from(paiementSalaire).where(eq(paiementSalaire.dossierRHId, dossierPaye)))).toBe(1);
  });

  test("l'Administrateur efface définitivement la fiche et ses données ; le nom reste pour l'historique, l'accès disparaît", async () => {
    connecter(a, adminA, "ADMIN");
    const r = await supprimerFicheCollaborateurAction(employeA);
    expect(r.erreur).toBeUndefined();
    expect(r.ok).toBe(true);

    // Tout ce qui est personnel a disparu.
    expect(await compter(a, (tx) => tx.select().from(dossierRH).where(eq(dossierRH.id, dossierEmploye)))).toBe(0);
    expect(await compter(a, (tx) => tx.select().from(demandeConge).where(eq(demandeConge.dossierRHId, dossierEmploye)))).toBe(0);
    expect(await compter(a, (tx) => tx.select().from(evaluation).where(eq(evaluation.dossierRHId, dossierEmploye)))).toBe(0);
    expect(await compter(a, (tx) => tx.select().from(documentRH).where(eq(documentRH.dossierRHId, dossierEmploye)))).toBe(0);
    expect(await compter(a, (tx) => tx.select().from(tachePoste).where(eq(tachePoste.utilisateurId, employeA)))).toBe(0);
    expect(await compter(a, (tx) => tx.select().from(mission).where(eq(mission.utilisateurId, employeA)))).toBe(0);
    expect(await compter(a, (tx) => tx.select().from(notePersonnelle).where(eq(notePersonnelle.utilisateurId, employeA)))).toBe(0);
    expect(await compter(a, (tx) => tx.select().from(stagiaireAcademique).where(eq(stagiaireAcademique.id, stagiaireEmbauche)))).toBe(0);

    // Les fichiers stockés sont à effacer (document RH, photo du stage), après la transaction.
    expect(effaces).toContain(`${a}/rh/contrat-${suffixe}.pdf`);
    expect(effaces).toContain(`${a}/photos/stagiaire.png`);

    // L'accès est retiré, le nom reste pour que ses tâches, documents et messages gardent leur auteur.
    const u = await lire(employeA);
    expect(u.statut).toBe("SUPPRIME");
    expect(u.nomComplet).toBe("employe-a");
    expect(u.email).toContain("compte-supprime.invalid");
    expect(await db.select().from(session).where(eq(session.userId, employeA))).toHaveLength(0);
    expect(await db.select().from(compte).where(eq(compte.userId, employeA))).toHaveLength(0);

    // Une deuxième suppression est refusée : la fiche n'existe plus.
    expect((await supprimerFicheCollaborateurAction(employeA)).erreur).toBeTruthy();
  });

  test("supprimer un Manager détache ceux qu'il encadrait et efface sa photo", async () => {
    connecter(a, adminA, "ADMIN");
    expect((await lire(subordonne)).managerId).toBe(managerA);
    const r = await supprimerFicheCollaborateurAction(managerA);
    expect(r.ok).toBe(true);
    expect((await lire(subordonne)).managerId).toBeNull();
    expect((await lire(managerA)).photoCleStockage).toBeNull();
    expect(effaces).toContain(`${a}/photos/manager.png`);
  });

  test("une personne sans fiche RH est retirée sans erreur", async () => {
    connecter(a, adminA, "ADMIN");
    const r = await supprimerFicheCollaborateurAction(employeSansFiche);
    expect(r.ok).toBe(true);
    expect((await lire(employeSansFiche)).statut).toBe("SUPPRIME");
  });
});

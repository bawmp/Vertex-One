import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { contact, entreprise, facture, interaction, paiement, promessePaiement, utilisateur } from "@/db/schema";
import { noterPromesse, annulerPromesse } from "@/lib/actions/promesse-paiement";
import { promettrePaiementPublic } from "@/lib/actions/client-documents";
import { resoudrePromessesFacture, traiterPromessesEchues } from "@/lib/facturation/promesse";
import { marquerFacturesEnRetard } from "@/lib/facturation/relance";
import { obtenirOuCreerLien } from "@/lib/client-documents/liens";
import {
  ajouterJours,
  aujourdhuiDouala,
  determinerMontantPromesse,
  ecartEnJours,
  estJourValide,
  promesseEchue,
  promesseTenue,
  verifierDatePromesse,
} from "@/lib/facturation/promesse-regles";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

// Envois d'email et de WhatsApp simulés (on vérifie QUI est prévenu et AVEC QUOI, jamais un vrai envoi) ; session et en-têtes simulés.
const { emails, apres } = vi.hoisted(() => ({
  emails: [] as { to: string; subject: string; html: string }[],
  apres: [] as (() => unknown)[],
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (fn: () => unknown) => { apres.push(fn); } }));
vi.mock("next/headers", () => ({ headers: async () => new Map([["x-forwarded-for", "203.0.113.9"]]) }));
vi.mock("@/lib/i18n/langue", () => ({ getT: async () => (texte: string) => texte }));
vi.mock("@/lib/email/client", () => ({ envoyerEmail: async (m: { to: string; subject: string; html: string }) => { emails.push(m); return { envoye: true }; } }));
vi.mock("@/lib/whatsapp/client", () => ({ envoyerWhatsApp: async () => ({ envoye: false, erreur: "test" }) }));
let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

describe("Promesse de paiement — règles pures", () => {
  test("jours : calendrier réel, ajout et écart", () => {
    expect(estJourValide("2026-02-28")).toBe(true);
    expect(estJourValide("2026-02-31")).toBe(false);
    expect(estJourValide("04/11/2026")).toBe(false);
    expect(estJourValide(20261104)).toBe(false);
    expect(ajouterJours("2026-02-27", 2)).toBe("2026-03-01");
    expect(ajouterJours("2026-01-01", -1)).toBe("2025-12-31");
    expect(ecartEnJours("2026-10-28", "2026-11-04")).toBe(7);
    expect(ecartEnJours("2026-10-28", "2026-10-27")).toBe(-1);
  });

  test("date de promesse : ni passée, ni invalide, ni au-delà de 60 jours ; le client doit viser à partir de demain", () => {
    const auj = "2026-10-28";
    expect(verifierDatePromesse("2026-10-28", auj)).toBeNull();
    expect(verifierDatePromesse("2026-11-04", auj)).toBeNull();
    expect(verifierDatePromesse("2026-12-27", auj)).toBeNull(); // 60 jours
    expect(verifierDatePromesse("2026-12-28", auj)).toBe("La date promise est trop lointaine (60 jours au plus).");
    expect(verifierDatePromesse("2026-10-27", auj)).toBe("La date promise ne peut pas être dans le passé.");
    expect(verifierDatePromesse("n'importe quoi", auj)).toBe("Date invalide.");
    expect(verifierDatePromesse("2026-10-28", auj, "2026-10-29")).toBe("Choisissez une date à partir de demain.");
    expect(verifierDatePromesse("2026-10-29", auj, "2026-10-29")).toBeNull();
  });

  test("échéance : un jour de grâce après la date promise", () => {
    expect(promesseEchue("2026-10-28", "2026-10-28")).toBe(false);
    expect(promesseEchue("2026-10-28", "2026-10-29")).toBe(false); // jour de grâce
    expect(promesseEchue("2026-10-28", "2026-10-30")).toBe(true);
  });

  test("tenue : facture soldée, ou règlements depuis la promesse couvrant le montant promis", () => {
    expect(promesseTenue({ montantPromis: 50000, solde: 0, payeDepuis: 0 })).toBe(true);
    expect(promesseTenue({ montantPromis: 50000, solde: 70000, payeDepuis: 50000 })).toBe(true);
    expect(promesseTenue({ montantPromis: 50000, solde: 70000, payeDepuis: 49999 })).toBe(false);
  });

  test("montant promis : le solde par défaut, jamais plus que le solde, entier strictement positif", () => {
    expect(determinerMontantPromesse(80000, undefined)).toEqual({ montant: 80000 });
    expect(determinerMontantPromesse(80000, "")).toEqual({ montant: 80000 });
    expect(determinerMontantPromesse(80000, "30000")).toEqual({ montant: 30000 });
    expect(determinerMontantPromesse(80000, 80001)).toEqual({ erreur: "Le montant promis dépasse le solde restant à payer." });
    expect(determinerMontantPromesse(80000, 0)).toEqual({ erreur: "Montant invalide." });
    expect(determinerMontantPromesse(80000, "12.5")).toEqual({ erreur: "Montant invalide." });
    expect(determinerMontantPromesse(0, undefined)).toEqual({ erreur: "Cette facture n'a plus de solde à régler." });
  });
});

describe("Promesse de paiement — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Promesse A ${suffixe}`;
  const nomB = `TEST Promesse B ${suffixe}`;
  let a = "", b = "";
  let adminA = "", managerA = "", employeA = "", adminB = "";
  let contactA = "", contactB = "";
  const f: Record<string, string> = {};
  const auj = aujourdhuiDouala();
  const emailClient = `client-${suffixe}@vertexone.test`;

  async function creerFacture(entrepriseId: string, assigneAId: string, contactId: string, cle: string, options: { ttc?: number; echeanceJours?: number; reponse?: string | null; statut?: "EMISE" | "ANNULEE" } = {}) {
    const [{ id }] = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .insert(facture)
        .values({
          entrepriseId,
          numero: `FAC-${suffixe}-${cle}`,
          contactId,
          assigneAId,
          statut: options.statut ?? "EMISE",
          montantHT: options.ttc ?? 100000,
          montantTVA: 0,
          montantTTC: options.ttc ?? 100000,
          dateEcheance: new Date(Date.now() + (options.echeanceJours ?? -10) * 86_400_000),
          reponseClient: options.reponse === undefined ? "ACCEPTEE" : options.reponse,
        })
        .returning({ id: facture.id })
    );
    f[cle] = id;
    return id;
  }
  const form = (champs: Record<string, string>) => {
    const d = new FormData();
    for (const [k, v] of Object.entries(champs)) d.set(k, v);
    return d;
  };
  const promessesDe = (entrepriseId: string, factureId: string) => avecEntreprise(entrepriseId, (tx) => tx.select().from(promessePaiement).where(eq(promessePaiement.factureId, factureId)));
  const statutDe = async (entrepriseId: string, factureId: string) => (await avecEntreprise(entrepriseId, (tx) => tx.select({ s: facture.statut }).from(facture).where(eq(facture.id, factureId))))[0].s;
  const insererPromesse = (entrepriseId: string, factureId: string, valeurs: Partial<typeof promessePaiement.$inferInsert> & { datePromise: string; montant: number }) =>
    avecEntreprise(entrepriseId, (tx) => tx.insert(promessePaiement).values({ entrepriseId, factureId, canal: "appel", source: "EQUIPE", ...valeurs }).returning());

  beforeAll(async () => {
    [{ id: a }] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "generique" }).returning({ id: entreprise.id });
    [{ id: b }] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "generique" }).returning({ id: entreprise.id });
    const u = async (entrepriseId: string, prefixe: string, role: "ADMIN" | "MANAGER" | "EMPLOYE") =>
      (await db.insert(utilisateur).values({ entrepriseId, email: `${prefixe}-${suffixe}@vertexone.test`, nomComplet: prefixe, role }).returning({ id: utilisateur.id }))[0].id;
    adminA = await u(a, "admin-a", "ADMIN");
    managerA = await u(a, "manager-a", "MANAGER");
    employeA = await u(a, "employe-a", "EMPLOYE");
    adminB = await u(b, "admin-b", "ADMIN");
    [{ id: contactA }] = await avecEntreprise(a, (tx) => tx.insert(contact).values({ entrepriseId: a, nom: "Client A", telephone: "690000001", email: emailClient, assigneAId: adminA }).returning({ id: contact.id }));
    [{ id: contactB }] = await avecEntreprise(b, (tx) => tx.insert(contact).values({ entrepriseId: b, nom: "Client B", telephone: "690000002", assigneAId: adminB }).returning({ id: contact.id }));
  }, 120_000);

  beforeEach(() => {
    emails.length = 0;
    apres.length = 0;
  });

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 120_000);

  test("l'Administrateur note une promesse : montant = solde par défaut, historique du contact, relance suspendue", async () => {
    await creerFacture(a, adminA, contactA, "note", { ttc: 100000 });
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const demain7 = ajouterJours(auj, 7);
    expect(await noterPromesse(f.note, null, form({ datePromise: demain7, canal: "whatsapp", note: "Il paie le 5" }))).toBeNull();

    const [p] = await promessesDe(a, f.note);
    expect(p).toMatchObject({ statut: "EN_COURS", datePromise: demain7, montant: 100000, canal: "whatsapp", source: "EQUIPE", note: "Il paie le 5", creeParId: adminA, contactId: contactA });
    const journal = await avecEntreprise(a, (tx) => tx.select().from(interaction).where(eq(interaction.contactId, contactA)));
    expect(journal.some((i) => i.type === "whatsapp" && i.contenu.includes(`FAC-${suffixe}-note`) && i.contenu.includes("Promesse de paiement"))).toBe(true);
  }, 120_000);

  test("valeurs invalides refusées : date passée ou invalide ou trop lointaine, canal inconnu, montant trop grand ou nul", async () => {
    await creerFacture(a, adminA, contactA, "valide", { ttc: 90000 });
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const base = { datePromise: ajouterJours(auj, 3), canal: "appel" };
    expect((await noterPromesse(f.valide, null, form({ ...base, datePromise: ajouterJours(auj, -1) })))?.erreur).toBe("La date promise ne peut pas être dans le passé.");
    expect((await noterPromesse(f.valide, null, form({ ...base, datePromise: "2026-02-31" })))?.erreur).toBe("Date invalide.");
    expect((await noterPromesse(f.valide, null, form({ ...base, datePromise: ajouterJours(auj, 61) })))?.erreur).toBe("La date promise est trop lointaine (60 jours au plus).");
    expect((await noterPromesse(f.valide, null, form({ ...base, canal: "pigeon" })))?.erreur).toBe("Choisissez comment le client vous l'a annoncé.");
    expect((await noterPromesse(f.valide, null, form({ ...base, montant: "90001" })))?.erreur).toBe("Le montant promis dépasse le solde restant à payer.");
    expect((await noterPromesse(f.valide, null, form({ ...base, montant: "0" })))?.erreur).toBe("Montant invalide.");
    expect(await promessesDe(a, f.valide)).toHaveLength(0);
  }, 120_000);

  test("une nouvelle promesse REMPLACE celle qui court (l'ancienne reste dans l'historique) ; jamais deux en cours", async () => {
    await creerFacture(a, adminA, contactA, "remplace");
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    expect(await noterPromesse(f.remplace, null, form({ datePromise: ajouterJours(auj, 3), canal: "appel" }))).toBeNull();
    expect(await noterPromesse(f.remplace, null, form({ datePromise: ajouterJours(auj, 9), canal: "rendez-vous", montant: "40000" }))).toBeNull();
    const toutes = await promessesDe(a, f.remplace);
    expect(toutes).toHaveLength(2);
    expect(toutes.filter((p) => p.statut === "EN_COURS")).toHaveLength(1);
    expect(toutes.find((p) => p.statut === "EN_COURS")).toMatchObject({ datePromise: ajouterJours(auj, 9), montant: 40000 });
    expect(toutes.find((p) => p.statut === "ANNULEE")).toMatchObject({ datePromise: ajouterJours(auj, 3) });
    // La base elle-même refuse deux promesses en cours pour la même facture.
    await expect(insererPromesse(a, f.remplace, { datePromise: ajouterJours(auj, 5), montant: 1000 })).rejects.toThrow();
  }, 120_000);

  test("retirer la promesse en cours ; rien à retirer = erreur", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    expect(await annulerPromesse(f.remplace)).toBeNull();
    expect((await promessesDe(a, f.remplace)).filter((p) => p.statut === "EN_COURS")).toHaveLength(0);
    expect((await annulerPromesse(f.remplace))?.erreur).toBe("Aucune promesse en cours pour cette facture.");
  }, 120_000);

  test("droits et portée : l'Employé n'a pas le droit ; le Manager n'atteint que sa portée ; une facture d'un collègue est introuvable", async () => {
    await creerFacture(a, managerA, contactA, "manager");
    connecte = { utilisateurId: employeA, entrepriseId: a, role: "EMPLOYE" };
    expect((await noterPromesse(f.manager, null, form({ datePromise: ajouterJours(auj, 3), canal: "appel" })))?.erreur).toBe("Vous n'avez pas le droit de modifier cette facture.");

    connecte = { utilisateurId: managerA, entrepriseId: a, role: "MANAGER" };
    expect(await noterPromesse(f.manager, null, form({ datePromise: ajouterJours(auj, 3), canal: "appel" }))).toBeNull(); // sa propre facture
    expect((await noterPromesse(f.note, null, form({ datePromise: ajouterJours(auj, 3), canal: "appel" })))?.erreur).toBe("Cette facture est introuvable."); // celle de l'Administrateur
    expect((await promessesDe(a, f.note)).filter((p) => p.statut === "EN_COURS")).toHaveLength(1); // inchangée (celle de l'Administrateur)
  }, 120_000);

  test("FUITE ENTRE ENTREPRISES : une autre entreprise ne peut ni lire, ni noter, ni écrire une promesse de la première", async () => {
    await creerFacture(b, adminB, contactB, "b1");
    connecte = { utilisateurId: adminB, entrepriseId: b, role: "ADMIN" };
    // L'Administrateur de B vise la facture de A avec son identifiant.
    expect((await noterPromesse(f.note, null, form({ datePromise: ajouterJours(auj, 3), canal: "appel" })))?.erreur).toBe("Cette facture est introuvable.");
    expect(await annulerPromesse(f.note)).toEqual({ erreur: "Aucune promesse en cours pour cette facture." });
    // Il ne voit aucune promesse de A, et la base refuse d'écrire au nom de A depuis le contexte de B.
    expect(await avecEntreprise(b, (tx) => tx.select().from(promessePaiement))).toHaveLength(0);
    expect(await db.select().from(promessePaiement)).toHaveLength(0); // sans session : rien
    await expect(insererPromesse(b, f.note, { datePromise: ajouterJours(auj, 3), montant: 1000, entrepriseId: a })).rejects.toThrow();
    expect((await promessesDe(a, f.note)).filter((p) => p.statut === "EN_COURS")).toHaveLength(1);
  }, 120_000);

  test("RELANCE SUSPENDUE : une facture en retard avec promesse en cours n'est ni passée en retard ni relancée ; sans promesse, si", async () => {
    await creerFacture(a, adminA, contactA, "retardPromis", { echeanceJours: -10 });
    await creerFacture(a, adminA, contactA, "retardSans", { echeanceJours: -10 });
    await insererPromesse(a, f.retardPromis, { datePromise: ajouterJours(auj, 5), montant: 100000, creeParId: adminA });

    await avecEntreprise(a, (tx) => marquerFacturesEnRetard(tx, a));
    expect(await statutDe(a, f.retardPromis)).toBe("EMISE");
    expect(await statutDe(a, f.retardSans)).toBe("EN_RETARD");
    const sujets = emails.map((e) => e.subject).join(" | ");
    expect(sujets).toContain(`FAC-${suffixe}-retardSans`);
    expect(sujets).not.toContain(`FAC-${suffixe}-retardPromis`);

    // La promesse est retirée : la relance repart au prochain balayage.
    emails.length = 0;
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    expect(await annulerPromesse(f.retardPromis)).toBeNull();
    await avecEntreprise(a, (tx) => marquerFacturesEnRetard(tx, a));
    expect(await statutDe(a, f.retardPromis)).toBe("EN_RETARD");
    expect(emails.map((e) => e.subject).join(" | ")).toContain(`FAC-${suffixe}-retardPromis`);
  }, 120_000);

  test("PROMESSE TENUE : un règlement qui couvre le montant promis (ou solde la facture) la résout ; un règlement partiel non", async () => {
    await creerFacture(a, adminA, contactA, "tenue", { ttc: 80000, echeanceJours: 10 });
    const [p] = await insererPromesse(a, f.tenue, { datePromise: ajouterJours(auj, 4), montant: 80000, creeParId: adminA });
    const regler = (factureId: string, montant: number) => avecEntreprise(a, (tx) => tx.insert(paiement).values({ entrepriseId: a, factureId, montant, moyenPaiement: "manuel", datePaiement: new Date() }));

    await regler(f.tenue, 30000);
    expect(await avecEntreprise(a, (tx) => resoudrePromessesFacture(tx, a, f.tenue))).toBeNull();
    expect((await promessesDe(a, f.tenue))[0].statut).toBe("EN_COURS");

    await regler(f.tenue, 50000);
    expect(await avecEntreprise(a, (tx) => resoudrePromessesFacture(tx, a, f.tenue))).toBe("TENUE");
    const apresPaiement = (await promessesDe(a, f.tenue)).find((x) => x.id === p.id)!;
    expect(apresPaiement.statut).toBe("TENUE");
    expect(apresPaiement.resolueLe).not.toBeNull();

    // Promesse partielle : 30 000 promis sur 100 000, le client règle 30 000 → tenue, même s'il reste un solde.
    await creerFacture(a, adminA, contactA, "tenuePartielle", { ttc: 100000, echeanceJours: 10 });
    await insererPromesse(a, f.tenuePartielle, { datePromise: ajouterJours(auj, 4), montant: 30000, creeParId: adminA });
    await regler(f.tenuePartielle, 30000);
    expect(await avecEntreprise(a, (tx) => resoudrePromessesFacture(tx, a, f.tenuePartielle))).toBe("TENUE");
  }, 120_000);

  test("une facture annulée annule sa promesse", async () => {
    await creerFacture(a, adminA, contactA, "annulee", { echeanceJours: 10 });
    await insererPromesse(a, f.annulee, { datePromise: ajouterJours(auj, 4), montant: 100000, creeParId: adminA });
    await avecEntreprise(a, (tx) => tx.update(facture).set({ statut: "ANNULEE" }).where(eq(facture.id, f.annulee)));
    expect(await avecEntreprise(a, (tx) => resoudrePromessesFacture(tx, a, f.annulee))).toBe("ANNULEE");
    expect((await promessesDe(a, f.annulee))[0].statut).toBe("ANNULEE");
  }, 120_000);

  test("PROMESSE NON TENUE : date + jour de grâce dépassés → non tenue, alerte envoyée UNE fois, historique du contact, la relance reprend", async () => {
    await creerFacture(a, adminA, contactA, "echue", { ttc: 60000, echeanceJours: -20 });
    await creerFacture(a, adminA, contactA, "grace", { ttc: 60000, echeanceJours: -20 });
    await insererPromesse(a, f.echue, { datePromise: ajouterJours(auj, -3), montant: 60000, creeParId: managerA });
    await insererPromesse(a, f.grace, { datePromise: ajouterJours(auj, -1), montant: 60000, creeParId: managerA }); // encore dans le jour de grâce

    const r1 = await avecEntreprise(a, (tx) => traiterPromessesEchues(tx, a));
    expect(r1.nonTenues).toBeGreaterThanOrEqual(1);
    expect((await promessesDe(a, f.echue))[0]).toMatchObject({ statut: "NON_TENUE" });
    expect((await promessesDe(a, f.echue))[0].alerteLe).not.toBeNull();
    expect((await promessesDe(a, f.grace))[0].statut).toBe("EN_COURS");

    const alertes = emails.filter((e) => e.subject.includes(`FAC-${suffixe}-echue`) && e.subject.startsWith("Promesse de paiement non tenue"));
    expect(alertes.map((e) => e.to).sort()).toEqual([`admin-a-${suffixe}@vertexone.test`, `manager-a-${suffixe}@vertexone.test`]); // administrateurs + auteur
    const journal = await avecEntreprise(a, (tx) => tx.select().from(interaction).where(eq(interaction.contactId, contactA)));
    expect(journal.some((i) => i.contenu.includes("non tenue") && i.contenu.includes(`FAC-${suffixe}-echue`))).toBe(true);

    // Deuxième balayage : pas de seconde alerte.
    emails.length = 0;
    await avecEntreprise(a, (tx) => traiterPromessesEchues(tx, a));
    expect(emails.filter((e) => e.subject.includes(`FAC-${suffixe}-echue`) && e.subject.startsWith("Promesse de paiement non tenue"))).toHaveLength(0);

    // Les relances reprennent : la facture de la promesse non tenue passe en retard et le client est relancé.
    emails.length = 0;
    await avecEntreprise(a, (tx) => marquerFacturesEnRetard(tx, a));
    expect(await statutDe(a, f.echue)).toBe("EN_RETARD");
    expect(emails.some((e) => e.to === emailClient && e.subject.includes(`FAC-${suffixe}-echue`))).toBe(true);
    expect(await statutDe(a, f.grace)).toBe("EMISE"); // sa promesse court encore (jour de grâce) : toujours suspendue
  }, 180_000);

  describe("Côté client (page publique)", () => {
    const tokenDe = (entrepriseId: string, factureId: string) => avecEntreprise(entrepriseId, (tx) => obtenirOuCreerLien(tx, entrepriseId, { factureId }));

    test("le client annonce sa date : promesse CLIENT avec IP, montant = solde, équipe prévenue APRÈS la réponse, texte échappé", async () => {
      await creerFacture(a, adminA, contactA, "public", { ttc: 70000, echeanceJours: -3 });
      const jeton = await tokenDe(a, f.public);
      connecte = null; // aucune session : seul le jeton autorise
      const demain = ajouterJours(auj, 1);
      const r = await promettrePaiementPublic(jeton, ajouterJours(auj, 6), "Je reçois mon salaire le <b>5</b>");
      expect(r?.erreur).toBeUndefined();
      expect(r?.succes).toContain("C'est noté");

      const [p] = await promessesDe(a, f.public);
      expect(p).toMatchObject({ statut: "EN_COURS", source: "CLIENT", canal: "client", montant: 70000, creeParId: null, clientIp: "203.0.113.9", entrepriseId: a });
      expect(p.note).toBe("Je reçois mon salaire le <b>5</b>");
      expect(emails).toHaveLength(0); // rien ne part avant la fin de la réponse
      for (const tache of apres) await tache();
      expect(emails.length).toBeGreaterThan(0);
      expect(emails.every((e) => e.html.includes("&lt;b&gt;5&lt;/b&gt;") && !e.html.includes("<b>5</b>"))).toBe(true);
      expect(emails.map((e) => e.to)).toContain(`admin-a-${suffixe}@vertexone.test`);
      // Relance suspendue pour cette facture en retard.
      await avecEntreprise(a, (tx) => marquerFacturesEnRetard(tx, a));
      expect(await statutDe(a, f.public)).toBe("EMISE");
      // Demain est accepté, aujourd'hui non.
      expect((await promettrePaiementPublic(jeton, demain))?.erreur).toBeUndefined();
      expect((await promettrePaiementPublic(jeton, auj))?.erreur).toBe("Choisissez une date à partir de demain.");
      expect((await promettrePaiementPublic(jeton, ajouterJours(auj, 61)))?.erreur).toBe("La date promise est trop lointaine (60 jours au plus).");
    }, 120_000);

    test("refus : lien invalide, facture non acceptée, contestée, réglée ou annulée", async () => {
      expect((await promettrePaiementPublic("x".repeat(32), ajouterJours(auj, 3)))?.erreur).toBe("Ce lien n'est pas valide.");
      expect((await promettrePaiementPublic("trop-court", ajouterJours(auj, 3)))?.erreur).toBe("Ce lien n'est pas valide.");

      await creerFacture(a, adminA, contactA, "nonAcceptee", { reponse: null });
      await creerFacture(a, adminA, contactA, "contestee", { reponse: "CONTESTEE" });
      await creerFacture(a, adminA, contactA, "payeeP", { ttc: 1000 });
      await avecEntreprise(a, (tx) => tx.update(facture).set({ statut: "PAYEE" }).where(eq(facture.id, f.payeeP)));
      await creerFacture(a, adminA, contactA, "annuleeP", { statut: "ANNULEE" });
      const dans3 = ajouterJours(auj, 3);
      expect((await promettrePaiementPublic(await tokenDe(a, f.nonAcceptee), dans3))?.erreur).toBe("Acceptez d'abord la facture pour annoncer une date de paiement.");
      expect((await promettrePaiementPublic(await tokenDe(a, f.contestee), dans3))?.erreur).toBe("Acceptez d'abord la facture pour annoncer une date de paiement.");
      expect((await promettrePaiementPublic(await tokenDe(a, f.payeeP), dans3))?.erreur).toBe("Cette facture est déjà réglée.");
      expect((await promettrePaiementPublic(await tokenDe(a, f.annuleeP), dans3))?.erreur).toBe("Cette facture a été annulée.");
      for (const cle of ["nonAcceptee", "contestee", "payeeP", "annuleeP"]) expect(await promessesDe(a, f[cle])).toHaveLength(0);
    }, 120_000);

    test("au plus 5 déclarations par heure et par facture", async () => {
      await creerFacture(a, adminA, contactA, "limite");
      const jeton = await tokenDe(a, f.limite);
      for (let i = 1; i <= 5; i++) expect((await promettrePaiementPublic(jeton, ajouterJours(auj, i + 1)))?.erreur).toBeUndefined();
      expect((await promettrePaiementPublic(jeton, ajouterJours(auj, 9)))?.erreur).toBe("Vous avez modifié cette date plusieurs fois : réessayez dans une heure.");
      expect((await promessesDe(a, f.limite)).filter((p) => p.statut === "EN_COURS")).toHaveLength(1);
    }, 180_000);

    test("FUITE ENTRE ENTREPRISES : le jeton d'une entreprise n'écrit que dans SA facture", async () => {
      await creerFacture(b, adminB, contactB, "publicB", { ttc: 20000 });
      const jetonB = await tokenDe(b, f.publicB);
      expect((await promettrePaiementPublic(jetonB, ajouterJours(auj, 4)))?.erreur).toBeUndefined();
      const chezB = await promessesDe(b, f.publicB);
      expect(chezB).toHaveLength(1);
      expect(chezB[0].entrepriseId).toBe(b);
      // Rien n'a été écrit dans les factures de A, et les promesses de A restent invisibles depuis B.
      const chezA = await avecEntreprise(a, (tx) => tx.select({ id: promessePaiement.id }).from(promessePaiement).where(and(eq(promessePaiement.entrepriseId, a), eq(promessePaiement.factureId, f.publicB))));
      expect(chezA).toHaveLength(0);
      expect((await avecEntreprise(b, (tx) => tx.select().from(promessePaiement))).every((p) => p.entrepriseId === b)).toBe(true);
    }, 120_000);
  });
});

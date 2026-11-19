import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, lead, relanceProspect, emailEnvoye } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

// Chaque test enchaîne plusieurs passages complets contre une base distante : 30 s (défaut) ne suffit pas, et un dépassement déborderait sur les tests suivants.
vi.setConfig({ testTimeout: 240_000 });
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (u: string) => {
    throw new Error(`REDIRECT ${u}`);
  },
}));
vi.mock("@/lib/i18n/langue", () => ({
  getT: async () => Object.assign((texte: string, v?: Record<string, string | number>) => (v ? texte.replace(/\{(\w+)\}/g, (b, k: string) => String(v[k] ?? b)) : texte), { locale: "fr-FR" }),
}));
let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));
// Aucun e-mail réel ne part : l'appel à Resend est simulé, tout le reste (base, RLS, portée, réservation) est réel.
type Envoi = { to: string; subject: string; html: string; replyTo?: string; nomExpediteur?: string };
const envoyerEmailMock = vi.fn<(p: Envoi) => Promise<{ envoye: boolean }>>(async () => ({ envoye: true }));
vi.mock("@/lib/email/client", () => ({ envoyerEmail: (p: Envoi) => envoyerEmailMock(p) }));
vi.mock("@/lib/email/logo", () => ({ enteteLogoEmail: async () => "" }));

const { lireDelais, jourPrevuEtape, decider, infoAuto, DELAIS_PAR_DEFAUT } = await import("@/lib/crm/sequence-prospects");
const { executerSequenceEntreprise, apercuSequence } = await import("@/lib/crm/sequence-prospects-executer");
const { definirSequenceProspects, noterRelanceProspect, marquerAReponduProspect, arreterSequenceProspect, reprendreSequenceProspect, relancerProspectsParEmail } = await import("@/lib/actions/prospect");
const { changerStatutLead } = await import("@/lib/actions/lead");
const { aujourdhuiDouala, ajouterJours } = await import("@/lib/facturation/promesse-regles");

const JOUR = 86_400_000;
const il = (jours: number) => new Date(Date.now() - jours * JOUR);
const dans = (jours: number) => new Date(Date.now() + jours * JOUR);

describe("Relance automatique — règles pures", () => {
  test("les délais : 1 à 3 jours croissants, de 1 à 90 ; tout le reste est refusé (jamais deviné)", () => {
    expect(lireDelais("3, 7, 14")).toEqual([3, 7, 14]);
    expect(lireDelais("3,7,14")).toEqual([3, 7, 14]);
    expect(lireDelais("5")).toEqual([5]);
    expect(lireDelais("2 ; 9")).toEqual([2, 9]);
    expect(lireDelais("")).toBeNull();
    expect(lireDelais("3, 3")).toBeNull(); // pas strictement croissant
    expect(lireDelais("7, 3")).toBeNull();
    expect(lireDelais("0, 3")).toBeNull();
    expect(lireDelais("3, 7, 14, 30")).toBeNull(); // 4 étapes : trop
    expect(lireDelais("3, abc")).toBeNull();
    expect(lireDelais("91")).toBeNull();
    expect(lireDelais("-3")).toBeNull();
  });

  const base = { statut: "QUALIFIE", convertiLe: null, email: "p@x.test", qualifieLe: new Date("2026-11-01T10:00:00Z"), creeLe: new Date("2026-10-20T10:00:00Z"), sequenceEtape: 0, sequenceDerniereLe: null, sequenceArreteeLe: null, derniereRelanceLe: null };

  test("le jour prévu : J+3 après la qualification, puis l'écart (4 jours, 7 jours) après le DERNIER envoi automatique", () => {
    expect(jourPrevuEtape(base, 0, [3, 7, 14])).toBe("2026-11-04");
    expect(jourPrevuEtape({ ...base, sequenceDerniereLe: new Date("2026-11-05T09:00:00Z") }, 1, [3, 7, 14])).toBe("2026-11-09");
    expect(jourPrevuEtape({ ...base, sequenceDerniereLe: new Date("2026-11-10T09:00:00Z") }, 2, [3, 7, 14])).toBe("2026-11-17");
  });

  test("la décision : attendre, envoyer, terminer, arrêter, sans adresse, non concerné", () => {
    const delais = [3, 7, 14];
    expect(decider(base, delais, new Date("2026-11-03T10:00:00Z"))).toEqual({ action: "ATTENDRE", jour: "2026-11-04", etape: 0 });
    expect(decider(base, delais, new Date("2026-11-04T10:00:00Z"))).toMatchObject({ action: "ENVOYER", etape: 0, modele: "prise-de-nouvelles" });
    expect(decider({ ...base, sequenceEtape: 1, sequenceDerniereLe: new Date("2026-11-05T09:00:00Z") }, delais, new Date("2026-11-09T10:00:00Z"))).toMatchObject({ action: "ENVOYER", etape: 1, modele: "rappel-demande" });
    expect(decider({ ...base, sequenceEtape: 2, sequenceDerniereLe: new Date("2026-11-10T09:00:00Z") }, delais, new Date("2026-11-17T10:00:00Z"))).toMatchObject({ action: "ENVOYER", etape: 2, modele: "derniere-relance" });
    expect(decider({ ...base, sequenceEtape: 3 }, delais, new Date("2027-01-01T10:00:00Z"))).toEqual({ action: "TERMINEE" });
    expect(decider({ ...base, sequenceArreteeLe: new Date() }, delais, new Date("2026-11-10T10:00:00Z")).action).toBe("ARRETEE");
    expect(decider({ ...base, email: null }, delais, new Date("2026-11-10T10:00:00Z")).action).toBe("SANS_EMAIL");
    expect(decider({ ...base, statut: "CONTACTE" }, delais, new Date("2026-11-10T10:00:00Z")).action).toBe("NON_CONCERNE");
    expect(decider({ ...base, convertiLe: new Date() }, delais, new Date("2026-11-10T10:00:00Z")).action).toBe("NON_CONCERNE");
  });

  test("une relance faite à la main retarde l'e-mail automatique de 2 jours, sans jamais l'avancer", () => {
    const delais = [3, 7, 14];
    // Dû depuis le 4 ; relance manuelle le 9 → pas avant le 11.
    const apresRelance = { ...base, derniereRelanceLe: new Date("2026-11-09T10:00:00Z") };
    expect(decider(apresRelance, delais, new Date("2026-11-10T10:00:00Z"))).toEqual({ action: "ATTENDRE", jour: "2026-11-11", etape: 0 });
    expect(decider(apresRelance, delais, new Date("2026-11-11T10:00:00Z")).action).toBe("ENVOYER");
    // Une relance ancienne ne change rien.
    expect(decider({ ...base, derniereRelanceLe: new Date("2026-11-01T10:00:00Z") }, delais, new Date("2026-11-04T10:00:00Z")).action).toBe("ENVOYER");
  });

  test("infoAuto : l'étape à venir (1 = premier e-mail), le jour et le motif d'arrêt", () => {
    const delais = [3, 7, 14];
    const a = infoAuto({ ...base, sequenceArretMotif: null }, delais, new Date("2026-11-03T10:00:00Z"));
    expect(a).toMatchObject({ action: "ATTENDRE", jour: "2026-11-04", etape: 1, nbEtapes: 3, motif: null });
    const b = infoAuto({ ...base, sequenceArreteeLe: new Date(), sequenceArretMotif: "a_repondu" }, delais);
    expect(b).toMatchObject({ action: "ARRETEE", motif: "a_repondu" });
    expect(DELAIS_PAR_DEFAUT).toEqual([3, 7, 14]);
  });
});

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Sequence A ${suffixe}`;
const nomB = `TEST Sequence B ${suffixe}`;
let idA = "", idB = "", adminA = "", managerA = "", adminB = "";
let a1 = "", a2 = "", a3 = "", a4 = "", a5 = "", a6 = "", a7 = "", b1 = "";

const insererLead = (entrepriseId: string, v: Partial<typeof lead.$inferInsert> & { nom: string; telephone: string; assigneAId: string }) =>
  avecEntreprise(entrepriseId, async (tx) => (await tx.insert(lead).values({ entrepriseId, statut: "QUALIFIE", ...v }).returning({ id: lead.id }))[0].id);
const leadDe = (entrepriseId: string, id: string) => avecEntreprise(entrepriseId, async (tx) => (await tx.select().from(lead).where(eq(lead.id, id)))[0]);
const relancesDe = (entrepriseId: string, id: string) => avecEntreprise(entrepriseId, (tx) => tx.select().from(relanceProspect).where(eq(relanceProspect.leadId, id)));
const reglerEntreprise = (id: string, v: Partial<typeof entreprise.$inferInsert>) => db.update(entreprise).set(v).where(eq(entreprise.id, id));
const formulaire = (valeurs: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(valeurs)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x));
  return f;
};

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-assez-long-pour-etre-valide";
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence", sequenceProspectsActive: true }).returning({ id: entreprise.id });
  idA = a.id;
  idB = b.id;
  const crees = await db
    .insert(utilisateur)
    .values([
      { entrepriseId: idA, email: `admin-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN", statut: "ACTIF" },
      { entrepriseId: idA, email: `manager-a-${suffixe}@vertexone.test`, nomComplet: "Manager A", role: "MANAGER", statut: "ACTIF" },
      { entrepriseId: idB, email: `admin-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN", statut: "ACTIF" },
    ])
    .returning({ id: utilisateur.id, email: utilisateur.email });
  adminA = crees.find((u) => u.email.startsWith("admin-a"))!.id;
  managerA = crees.find((u) => u.email.startsWith("manager-a"))!.id;
  adminB = crees.find((u) => u.email.startsWith("admin-b"))!.id;

  const q = il(10); // qualifiés il y a 10 jours : le premier e-mail (J+3) est dû
  a1 = await insererLead(idA, { nom: "Prospect Un", telephone: "690 11 12 22", email: `un-${suffixe}@client.test`, qualifieLe: q, assigneAId: adminA });
  a2 = await insererLead(idA, { nom: "Prospect Deux", telephone: "699 00 00 02", email: `deux-${suffixe}@client.test`, qualifieLe: new Date(), assigneAId: adminA }); // qualifié aujourd'hui
  a3 = await insererLead(idA, { nom: "Sans Email", telephone: "677 00 00 03", qualifieLe: q, assigneAId: adminA });
  a4 = await insererLead(idA, { nom: "Arrete", telephone: "655 00 00 04", email: `quatre-${suffixe}@client.test`, qualifieLe: q, sequenceArreteeLe: new Date(), sequenceArretMotif: "manuel", assigneAId: adminA });
  a5 = await insererLead(idA, { nom: "Devenu Client", telephone: "655 00 00 05", email: `cinq-${suffixe}@client.test`, qualifieLe: q, convertiLe: new Date(), assigneAId: adminA });
  a6 = await insererLead(idA, { nom: "Pas Qualifie", telephone: "655 00 00 06", email: `six-${suffixe}@client.test`, statut: "CONTACTE", assigneAId: adminA });
  a7 = await insererLead(idA, { nom: "Relance Recente", telephone: "655 00 00 07", email: `sept-${suffixe}@client.test`, qualifieLe: q, assigneAId: managerA });
  await avecEntreprise(idA, (tx) => tx.insert(relanceProspect).values({ entrepriseId: idA, leadId: a7, canal: "whatsapp", contenu: "relance à la main hier", auteurId: adminA, creeLe: il(1) }));
  b1 = await insererLead(idB, { nom: "Prospect B", telephone: "690 99 99 99", email: `b-${suffixe}@client.test`, qualifieLe: q, assigneAId: adminB });
}, 60_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 120_000);

describe("Relance automatique — exécution", () => {
  test("désactivée par défaut : rien ne part, rien ne change", async () => {
    envoyerEmailMock.mockClear();
    const r = await executerSequenceEntreprise(idA);
    expect(r).toEqual({ active: false, envoyes: 0, echecs: 0, reportes: 0 });
    expect(envoyerEmailMock).not.toHaveBeenCalled();
    expect((await leadDe(idA, a1)).sequenceEtape).toBe(0);
  });

  test("activée : seul le prospect dû reçoit son premier e-mail — jamais un lead sans adresse, arrêté, devenu client, non qualifié, trop récent, ni relancé à la main hier", async () => {
    await reglerEntreprise(idA, { sequenceProspectsActive: true, sequenceProspectsDelais: "3,7,14", sequenceProspectsPlafond: 30 });
    envoyerEmailMock.mockClear();
    const r = await executerSequenceEntreprise(idA);
    expect(r).toEqual({ active: true, envoyes: 1, echecs: 0, reportes: 0 });
    expect(envoyerEmailMock).toHaveBeenCalledTimes(1);
    const envoi = envoyerEmailMock.mock.calls[0][0];
    expect(envoi.to).toBe(`un-${suffixe}@client.test`);
    expect(envoi.subject).toBe("Suite à notre échange"); // modèle de l'étape 1
    expect(envoi.html).toContain("Prospect Un"); // personnalisé avec son nom
    expect(envoi.html).toContain("stop"); // rappel pour se désabonner au bas du message
    expect(envoi.nomExpediteur).toBe(nomA);
    expect(envoi.replyTo).toBe(`admin-a-${suffixe}@vertexone.test`); // la réponse arrive à la personne qui suit ce prospect

    const apres = await leadDe(idA, a1);
    expect(apres.sequenceEtape).toBe(1);
    expect(apres.sequenceDerniereLe).not.toBeNull();
    const relances = await relancesDe(idA, a1);
    expect(relances).toHaveLength(1);
    expect(relances[0]).toMatchObject({ canal: "email", automatique: true, auteurId: null });
    const souches = await avecEntreprise(idA, (tx) => tx.select().from(emailEnvoye).where(eq(emailEnvoye.destinataire, `un-${suffixe}@client.test`)));
    expect(souches).toHaveLength(1);
    expect(souches[0]).toMatchObject({ type: "PROSPECT_AUTO", contactId: null });

    for (const id of [a2, a3, a4, a5, a6, a7]) expect((await leadDe(idA, id)).sequenceEtape).toBe(0);
  });

  test("un second passage le même jour n'envoie rien de plus (l'étape suivante est à J+7)", async () => {
    envoyerEmailMock.mockClear();
    const r = await executerSequenceEntreprise(idA);
    expect(r.envoyes).toBe(0);
    expect(envoyerEmailMock).not.toHaveBeenCalled();
  });

  test("l'aperçu des réglages dit exactement ce que le passage suivant enverrait", async () => {
    const apercu = await avecEntreprise(idA, (tx) => apercuSequence(tx, idA, dans(5)));
    expect(apercu!.dus.map((d) => d.id).sort()).toEqual([a1, a2, a7].sort()); // a1 : étape 2 ; a2 : étape 1 ; a7 : sa relance à la main date de plus de 2 jours
    expect(apercu!.dus.find((d) => d.id === a1)!.etape).toBe(2);
    expect(apercu!.dus.find((d) => d.id === a2)!.etape).toBe(1);
  });

  test("avec le temps : à J+5 le prospect 1 reçoit l'étape 2 (rappel de la demande), le prospect 2 sa première, puis l'étape 3 attend 7 jours", async () => {
    envoyerEmailMock.mockClear();
    const r = await executerSequenceEntreprise(idA, dans(5));
    expect(r.envoyes).toBe(3);
    const sujets = envoyerEmailMock.mock.calls.map((c) => `${c[0].to}|${c[0].subject}`);
    expect(sujets).toContain(`un-${suffixe}@client.test|Votre demande chez ${nomA}`); // étape 2
    expect(sujets).toContain(`deux-${suffixe}@client.test|Suite à notre échange`); // étape 1
    expect((await leadDe(idA, a1)).sequenceEtape).toBe(2);

    envoyerEmailMock.mockClear();
    expect((await executerSequenceEntreprise(idA, dans(8))).envoyes).toBe(0); // étape 3 de a1 : pas avant J+5+7 = J+12
    const r12 = await executerSequenceEntreprise(idA, dans(12));
    expect(r12.envoyes).toBeGreaterThanOrEqual(1);
    expect(envoyerEmailMock.mock.calls.map((c) => c[0].subject)).toContain("Votre projet est-il toujours d'actualité ?");
    expect((await leadDe(idA, a1)).sequenceEtape).toBe(3);

    envoyerEmailMock.mockClear();
    await executerSequenceEntreprise(idA, dans(60)); // la séquence est terminée : plus rien pour a1
    expect(envoyerEmailMock.mock.calls.some((c) => c[0].to === `un-${suffixe}@client.test`)).toBe(false);
  });

  test("un envoi qui échoue n'est ni compté ni noté : la réservation est annulée et le prochain passage réessaie", async () => {
    const c = await insererLead(idA, { nom: "Echec Envoi", telephone: "655 11 11 11", email: `echec-${suffixe}@client.test`, qualifieLe: il(10), assigneAId: adminA });
    envoyerEmailMock.mockClear();
    envoyerEmailMock.mockResolvedValueOnce({ envoye: false });
    const r1 = await executerSequenceEntreprise(idA, dans(100));
    expect(r1.echecs).toBe(1);
    const apres = await leadDe(idA, c);
    expect(apres.sequenceEtape).toBe(0);
    expect(apres.sequenceDerniereLe).toBeNull();
    expect(await relancesDe(idA, c)).toHaveLength(0);

    const r2 = await executerSequenceEntreprise(idA, dans(100));
    expect(r2.envoyes).toBeGreaterThanOrEqual(1);
    expect((await leadDe(idA, c)).sequenceEtape).toBe(1);
  });

  test("deux passages SIMULTANÉS n'envoient jamais deux fois au même prospect (réservation avant envoi)", async () => {
    const c = await insererLead(idA, { nom: "Course", telephone: "655 22 22 22", email: `course-${suffixe}@client.test`, qualifieLe: il(10), assigneAId: adminA });
    envoyerEmailMock.mockClear();
    await Promise.all([executerSequenceEntreprise(idA, dans(200)), executerSequenceEntreprise(idA, dans(200))]);
    const versLui = envoyerEmailMock.mock.calls.filter((x) => x[0].to === `course-${suffixe}@client.test`);
    expect(versLui).toHaveLength(1);
    expect((await leadDe(idA, c)).sequenceEtape).toBe(1);
    expect(await relancesDe(idA, c)).toHaveLength(1);
  });

  test("le plafond par jour : les plus en retard partent d'abord, le reste est reporté à demain", async () => {
    await reglerEntreprise(idA, { sequenceProspectsPlafond: 1 });
    const vieux = await insererLead(idA, { nom: "Tres Ancien", telephone: "655 33 33 33", email: `ancien-${suffixe}@client.test`, qualifieLe: il(60), assigneAId: adminA });
    const recent = await insererLead(idA, { nom: "Moins Ancien", telephone: "655 44 44 44", email: `recent-${suffixe}@client.test`, qualifieLe: il(20), assigneAId: adminA });
    envoyerEmailMock.mockClear();
    const r = await executerSequenceEntreprise(idA, dans(300));
    expect(r.envoyes).toBe(1);
    expect(r.reportes).toBeGreaterThanOrEqual(1);
    expect((await leadDe(idA, vieux)).sequenceEtape).toBe(1); // le plus ancien d'abord
    expect((await leadDe(idA, recent)).sequenceEtape).toBe(0);
    await reglerEntreprise(idA, { sequenceProspectsPlafond: 30 });
  });

  test("l'étanchéité : le passage d'une entreprise ne touche jamais les prospects d'une autre", async () => {
    // L'entreprise B a activé la séquence ; ses prospects ne bougent que pour SON passage.
    expect((await leadDe(idB, b1)).sequenceEtape).toBe(0);
    envoyerEmailMock.mockClear();
    await executerSequenceEntreprise(idA, dans(400));
    expect(envoyerEmailMock.mock.calls.some((x) => x[0].to === `b-${suffixe}@client.test`)).toBe(false);
    expect((await leadDe(idB, b1)).sequenceEtape).toBe(0);

    envoyerEmailMock.mockClear();
    const rB = await executerSequenceEntreprise(idB);
    expect(rB.envoyes).toBe(1);
    expect(envoyerEmailMock.mock.calls.some((x) => x[0].to === `b-${suffixe}@client.test`)).toBe(true);
    expect((await leadDe(idB, b1)).sequenceEtape).toBe(1);
    // …et rien n'a bougé du côté de A pour ce passage.
    expect(envoyerEmailMock.mock.calls.every((x) => x[0].to === `b-${suffixe}@client.test`)).toBe(true);
  });
});

describe("Relance automatique — commandes de l'équipe", () => {
  test("« Il a répondu » arrête la séquence et le note ; « Reprendre » la relance ; un autre utilisateur ou une autre entreprise ne peut pas", async () => {
    const c = await insererLead(idA, { nom: "Repond Vite", telephone: "655 55 55 55", email: `repond-${suffixe}@client.test`, qualifieLe: il(10), assigneAId: adminA });
    connecte = { entrepriseId: idA, utilisateurId: adminA, role: "ADMIN" };
    expect(await marquerAReponduProspect(c)).toEqual({ ok: true });
    const arrete = await leadDe(idA, c);
    expect(arrete.sequenceArreteeLe).not.toBeNull();
    expect(arrete.sequenceArretMotif).toBe("a_repondu");
    expect((await relancesDe(idA, c)).some((r) => r.canal === "note" && /répondu/.test(r.contenu))).toBe(true);

    envoyerEmailMock.mockClear();
    await executerSequenceEntreprise(idA, dans(500));
    expect(envoyerEmailMock.mock.calls.some((x) => x[0].to === `repond-${suffixe}@client.test`)).toBe(false);

    connecte = { entrepriseId: idB, utilisateurId: adminB, role: "ADMIN" };
    expect((await reprendreSequenceProspect(c)).erreur).toMatch(/introuvable/i); // autre entreprise
    connecte = { entrepriseId: idA, utilisateurId: managerA, role: "MANAGER" };
    expect((await reprendreSequenceProspect(c)).erreur).toMatch(/introuvable/i); // hors de la portée du Manager

    connecte = { entrepriseId: idA, utilisateurId: adminA, role: "ADMIN" };
    expect(await reprendreSequenceProspect(c)).toEqual({ ok: true });
    expect((await leadDe(idA, c)).sequenceArreteeLe).toBeNull();
    envoyerEmailMock.mockClear();
    await executerSequenceEntreprise(idA, dans(500));
    expect(envoyerEmailMock.mock.calls.some((x) => x[0].to === `repond-${suffixe}@client.test`)).toBe(true);

    expect(await arreterSequenceProspect(c)).toEqual({ ok: true });
    expect((await leadDe(idA, c)).sequenceArretMotif).toBe("manuel");
  });

  test("une simple remarque ne retarde pas l'e-mail automatique ; un appel noté le retarde", async () => {
    const c = await insererLead(idA, { nom: "Remarque Seule", telephone: "655 90 00 01", email: `remarque-${suffixe}@client.test`, qualifieLe: il(10), assigneAId: adminA });
    connecte = { entrepriseId: idA, utilisateurId: adminA, role: "ADMIN" };
    expect(await noterRelanceProspect(null, formulaire({ leadId: c, canal: "note", contenu: "Une simple remarque." }))).toEqual({ ok: true });
    let apercu = await avecEntreprise(idA, (tx) => apercuSequence(tx, idA));
    expect(apercu!.dus.map((d) => d.id)).toContain(c);
    expect(await noterRelanceProspect(null, formulaire({ leadId: c, canal: "appel", contenu: "Appelé à l'instant." }))).toEqual({ ok: true });
    apercu = await avecEntreprise(idA, (tx) => apercuSequence(tx, idA));
    expect(apercu!.dus.map((d) => d.id)).not.toContain(c);
  });

  test("un prospect qui redevient client ou quitte le statut Qualifié sort de la séquence ; (re)qualifié, il repart de zéro", async () => {
    const c = await insererLead(idA, { nom: "Repart Zero", telephone: "655 66 66 66", email: `zero-${suffixe}@client.test`, qualifieLe: il(10), sequenceEtape: 2, sequenceDerniereLe: il(3), assigneAId: adminA });
    connecte = { entrepriseId: idA, utilisateurId: adminA, role: "ADMIN" };
    await changerStatutLead(c, "CONTACTE");
    envoyerEmailMock.mockClear();
    await executerSequenceEntreprise(idA, dans(600));
    expect(envoyerEmailMock.mock.calls.some((x) => x[0].to === `zero-${suffixe}@client.test`)).toBe(false);

    await changerStatutLead(c, "QUALIFIE");
    const requalifie = await leadDe(idA, c);
    expect(requalifie.sequenceEtape).toBe(0);
    expect(requalifie.sequenceDerniereLe).toBeNull();
    expect(requalifie.sequenceArreteeLe).toBeNull();
  });

  test("les réglages : réservés à l'Administrateur, délais et plafond revalidés", async () => {
    connecte = { entrepriseId: idA, utilisateurId: managerA, role: "MANAGER" };
    expect((await definirSequenceProspects({ active: true, delais: "3,7,14", plafond: 30 })).erreur).toMatch(/Administrateur/);
    connecte = { entrepriseId: idA, utilisateurId: adminA, role: "ADMIN" };
    expect((await definirSequenceProspects({ active: true, delais: "7,3", plafond: 30 })).erreur).toMatch(/Délais invalides/);
    expect((await definirSequenceProspects({ active: true, delais: "3,7,14", plafond: 0 })).erreur).toMatch(/plafond/);
    expect((await definirSequenceProspects({ active: true, delais: "3,7,14", plafond: 9999 })).erreur).toMatch(/plafond/);
    expect(await definirSequenceProspects({ active: false, delais: "2, 5, 10", plafond: 12 })).toEqual({ ok: true });
    const [e] = await db.select().from(entreprise).where(eq(entreprise.id, idA));
    expect(e).toMatchObject({ sequenceProspectsActive: false, sequenceProspectsDelais: "2,5,10", sequenceProspectsPlafond: 12 });
    // L'autre entreprise n'a pas bougé.
    const [eb] = await db.select().from(entreprise).where(eq(entreprise.id, idB));
    expect(eb.sequenceProspectsDelais).toBe("3,7,14");
    await reglerEntreprise(idA, { sequenceProspectsActive: true, sequenceProspectsDelais: "3,7,14", sequenceProspectsPlafond: 30 });
  });
});

describe("Envoi groupé d'un même e-mail", () => {
  test("chaque destinataire reçoit son message personnalisé ; sans adresse, déjà client ou d'une autre entreprise : ignorés et listés", async () => {
    connecte = { entrepriseId: idA, utilisateurId: adminA, role: "ADMIN" };
    const p1 = await insererLead(idA, { nom: "Alice Groupe", telephone: "655 70 00 01", email: `alice-${suffixe}@client.test`, assigneAId: adminA });
    const p2 = await insererLead(idA, { nom: "Bob Groupe", telephone: "655 70 00 02", email: `bob-${suffixe}@client.test`, assigneAId: adminA });
    envoyerEmailMock.mockClear();
    const r = await relancerProspectsParEmail(null, formulaire({ leadIds: [p1, p2, a3, a5, b1], objet: "Bonjour {nom}", message: "Bonjour {nom}, c'est {entreprise}. Un message de groupe." }));
    expect(r?.resultat?.envoyes).toBe(2);
    // Un prospect déjà client ou d'une autre entreprise est « introuvable » (le serveur ne révèle pas son nom) ; celui sans adresse est nommé.
    expect(r?.resultat?.ignores.map((x) => x.nom).sort()).toEqual(["Prospect introuvable", "Prospect introuvable", "Sans Email"]);
    expect(r?.resultat?.echecs).toEqual([]);

    const appels = envoyerEmailMock.mock.calls.map((c) => c[0]);
    expect(appels).toHaveLength(2);
    const alice = appels.find((x) => x.to === `alice-${suffixe}@client.test`)!;
    const bob = appels.find((x) => x.to === `bob-${suffixe}@client.test`)!;
    expect(alice.subject).toBe("Bonjour Alice Groupe");
    expect(bob.subject).toBe("Bonjour Bob Groupe");
    expect(alice.html).toContain(nomA); // {entreprise} remplacé (l'apostrophe est échappée en HTML dans le corps)
    expect(alice.html).toContain("Un message de groupe.");
    expect(alice.html).not.toContain("{nom}");
    for (const id of [p1, p2]) {
      const rel = await relancesDe(idA, id);
      expect(rel).toHaveLength(1);
      expect(rel[0]).toMatchObject({ canal: "email", automatique: false, auteurId: adminA });
    }
    // Le prospect de l'autre entreprise n'a reçu AUCUN envoi groupé de A (sa seule relance éventuelle est l'automatique de son propre passage).
    expect((await relancesDe(idB, b1)).filter((r) => !r.automatique)).toHaveLength(0);
  });

  test("refus : aucune sélection, plus de 50, texte à compléter, droit absent ; un échec d'envoi ne bloque pas les autres", async () => {
    connecte = { entrepriseId: idA, utilisateurId: adminA, role: "ADMIN" };
    expect((await relancerProspectsParEmail(null, formulaire({ objet: "Bonjour", message: "Un message assez long." })))?.erreur).toMatch(/au moins un prospect/);
    const cinquanteEtUn = Array.from({ length: 51 }, (_, i) => `id-${i}`);
    expect((await relancerProspectsParEmail(null, formulaire({ leadIds: cinquanteEtUn, objet: "Bonjour", message: "Un message assez long." })))?.erreur).toMatch(/limité à 50/);
    expect((await relancerProspectsParEmail(null, formulaire({ leadIds: [a1], objet: "Bonjour", message: "Voici le lien : [lien de suivi]" })))?.erreur).toMatch(/Complétez ou retirez/);
    connecte = { entrepriseId: idA, utilisateurId: managerA, role: "CLIENT" }; // un compte du portail client n'a aucun droit CRM
    expect((await relancerProspectsParEmail(null, formulaire({ leadIds: [a1], objet: "Bonjour", message: "Un message assez long." })))?.erreur).toMatch(/pas le droit/);

    connecte = { entrepriseId: idA, utilisateurId: adminA, role: "ADMIN" };
    const c1 = await insererLead(idA, { nom: "Premier", telephone: "655 80 00 01", email: `premier-${suffixe}@client.test`, assigneAId: adminA });
    const c2 = await insererLead(idA, { nom: "Second", telephone: "655 80 00 02", email: `second-${suffixe}@client.test`, assigneAId: adminA });
    envoyerEmailMock.mockClear();
    envoyerEmailMock.mockResolvedValueOnce({ envoye: false });
    const r = await relancerProspectsParEmail(null, formulaire({ leadIds: [c1, c2], objet: "Bonjour {nom}", message: "Un message assez long." }));
    expect(r?.resultat?.envoyes).toBe(1);
    expect(r?.resultat?.echecs).toHaveLength(1);
    expect(r?.resultat?.echecs[0].nom).toBe("Premier");
    expect(await relancesDe(idA, c1)).toHaveLength(0); // jamais noté sans e-mail parti
    expect(await relancesDe(idA, c2)).toHaveLength(1);
  });
});

describe("Détails de dates", () => {
  test("le jour d'envoi est compté à l'heure de Douala", () => {
    const aujourdhui = aujourdhuiDouala();
    expect(ajouterJours(aujourdhui, 3) > aujourdhui).toBe(true);
  });
});

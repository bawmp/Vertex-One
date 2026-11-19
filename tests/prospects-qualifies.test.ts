import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, lead, contact, deal, relanceProspect, emailEnvoye } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

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
// Aucun e-mail réel ne part : l'appel à Resend est simulé, tout le reste (base, RLS, portée) est réel.
const envoyerEmailMock = vi.fn<(p: { to: string; subject: string }) => Promise<{ envoye: boolean }>>(async () => ({ envoye: true }));
vi.mock("@/lib/email/client", () => ({ envoyerEmail: (p: { to: string; subject: string }) => envoyerEmailMock(p) }));
vi.mock("@/lib/email/logo", () => ({ enteteLogoEmail: async () => "" }));

const { relancerProspectParEmail, ouvrirRelanceWhatsApp, noterRelanceProspect, definirRappelProspect, devenirClient } = await import("@/lib/actions/prospect");
const { changerStatutLead } = await import("@/lib/actions/lead");
const { listerProspectsQualifies, compterProspectsQualifies, historiqueRelances } = await import("@/lib/crm/prospects-donnees");
const { etatRelance, estARelancer, lienWhatsApp, remplirModeleRelance, DELAI_RELANCE_JOURS } = await import("@/lib/crm/prospects");
const { aujourdhuiDouala, ajouterJours } = await import("@/lib/facturation/promesse-regles");
const { supprimerLeadEnBase } = await import("@/lib/crm/suppression");

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Prospects A ${suffixe}`;
const nomB = `TEST Prospects B ${suffixe}`;
let idA = "", idB = "", adminA = "", managerA = "", adminB = "";
let l1 = "", l2 = "", l3 = "", l4 = "", l5 = "", lB = "";

const formulaire = (valeurs: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(valeurs)) f.set(k, v);
  return f;
};
const connecter = (entrepriseId: string, utilisateurId: string, role: string) => {
  connecte = { entrepriseId, utilisateurId, role };
};
const utilisateurDe = (entrepriseId: string, utilisateurId: string, role: "ADMIN" | "MANAGER") => ({ entrepriseId, utilisateurId, role });
const leadDe = (entrepriseId: string, id: string) => avecEntreprise(entrepriseId, async (tx) => (await tx.select().from(lead).where(eq(lead.id, id)))[0]);
const relancesDe = (entrepriseId: string, leadId: string) => avecEntreprise(entrepriseId, (tx) => tx.select().from(relanceProspect).where(eq(relanceProspect.leadId, leadId)));

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-assez-long-pour-etre-valide";
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
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

  const maintenant = new Date();
  const ins = (entrepriseId: string, valeurs: Partial<typeof lead.$inferInsert> & { nom: string; telephone: string; assigneAId: string }) =>
    avecEntreprise(entrepriseId, async (tx) => (await tx.insert(lead).values({ entrepriseId, ...valeurs }).returning({ id: lead.id }))[0].id);
  // L1 : qualifié, assigné à l'Admin A, avec e-mail ; L2 : qualifié, assigné au Manager A ; L3 : pas encore qualifié ; L4 : qualifié ET déjà client ;
  // L5 : qualifié, sans e-mail, numéro inutilisable ; LB : qualifié dans l'autre entreprise.
  l1 = await ins(idA, { nom: "Prospect Un", telephone: "690 11 12 22", email: `p1-${suffixe}@client.test`, statut: "QUALIFIE", qualifieLe: maintenant, assigneAId: adminA });
  l2 = await ins(idA, { nom: "Prospect Deux", telephone: "699 00 00 02", email: `p2-${suffixe}@client.test`, statut: "QUALIFIE", qualifieLe: maintenant, assigneAId: managerA });
  l3 = await ins(idA, { nom: "Lead Trois", telephone: "677 00 00 03", statut: "NOUVEAU", assigneAId: adminA });
  l4 = await ins(idA, { nom: "Client Quatre", telephone: "655 00 00 04", statut: "QUALIFIE", convertiLe: maintenant, assigneAId: adminA });
  l5 = await ins(idA, { nom: "Prospect Cinq", telephone: "12", statut: "QUALIFIE", qualifieLe: maintenant, assigneAId: adminA });
  lB = await ins(idB, { nom: "Prospect B", telephone: "690 99 99 99", email: `pb-${suffixe}@client.test`, statut: "QUALIFIE", qualifieLe: maintenant, assigneAId: adminB });
}, 60_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 60_000);

describe("Prospects qualifiés — règles pures", () => {
  test("état de relance : jamais relancé, récent, à relancer après 7 jours", () => {
    const maintenant = new Date("2026-11-19T10:00:00Z");
    expect(etatRelance({ rappelLe: null, derniereRelanceLe: null }, maintenant)).toBe("JAMAIS_RELANCE");
    expect(etatRelance({ rappelLe: null, derniereRelanceLe: new Date("2026-11-17T10:00:00Z") }, maintenant)).toBe("RELANCE_RECENTE");
    const limite = new Date(maintenant.getTime() - DELAI_RELANCE_JOURS * 24 * 3600 * 1000);
    expect(etatRelance({ rappelLe: null, derniereRelanceLe: limite }, maintenant)).toBe("A_RELANCER");
    expect(etatRelance({ rappelLe: null, derniereRelanceLe: new Date("2026-11-01T10:00:00Z") }, maintenant)).toBe("A_RELANCER");
  });

  test("un rappel daté prime : échu ou du jour → à relancer, futur → rappel prévu, même si une relance est toute récente", () => {
    const maintenant = new Date("2026-11-19T10:00:00Z");
    const hier = new Date("2026-11-18T10:00:00Z");
    expect(etatRelance({ rappelLe: "2026-11-19", derniereRelanceLe: hier }, maintenant)).toBe("A_RELANCER");
    expect(etatRelance({ rappelLe: "2026-11-10", derniereRelanceLe: hier }, maintenant)).toBe("A_RELANCER");
    expect(etatRelance({ rappelLe: "2026-11-25", derniereRelanceLe: null }, maintenant)).toBe("RAPPEL_PREVU");
    expect(estARelancer("A_RELANCER")).toBe(true);
    expect(estARelancer("JAMAIS_RELANCE")).toBe(true);
    expect(estARelancer("RAPPEL_PREVU")).toBe(false);
    expect(estARelancer("RELANCE_RECENTE")).toBe(false);
  });

  test("le lien WhatsApp : numéro local camerounais converti, message encodé, numéro inutilisable refusé", () => {
    expect(lienWhatsApp("690 11 12 22", "Bonjour Jean & Marie")).toBe("https://wa.me/237690111222?text=Bonjour%20Jean%20%26%20Marie");
    expect(lienWhatsApp("+33 6 12 34 56 78", "Salut")).toBe("https://wa.me/33612345678?text=Salut");
    expect(lienWhatsApp("12", "Salut")).toBeNull();
    expect(lienWhatsApp(null, "Salut")).toBeNull();
  });

  test("les modèles remplacent {nom} et {entreprise}", () => {
    expect(remplirModeleRelance("Bonjour {nom}, c'est {entreprise}.", { nom: "Jean", entreprise: "Garage Mbarga" })).toBe("Bonjour Jean, c'est Garage Mbarga.");
  });
});

describe("Prospects qualifiés — la liste", () => {
  test("l'Administrateur voit les prospects qualifiés non convertis de SON entreprise, jamais un lead non qualifié, un client, ni ceux d'une autre entreprise", async () => {
    const liste = await avecEntreprise(idA, (tx) => listerProspectsQualifies(tx, utilisateurDe(idA, adminA, "ADMIN")));
    const ids = liste.map((p) => p.id).sort();
    expect(ids).toEqual([l1, l2, l5].sort());
    expect(ids).not.toContain(l3); // pas qualifié
    expect(ids).not.toContain(l4); // déjà client
    expect(ids).not.toContain(lB); // autre entreprise
    expect(await avecEntreprise(idA, (tx) => compterProspectsQualifies(tx, utilisateurDe(idA, adminA, "ADMIN")))).toBe(3);
  });

  test("un Manager ne voit que les prospects de sa portée (les siens et ceux de son équipe)", async () => {
    const liste = await avecEntreprise(idA, (tx) => listerProspectsQualifies(tx, utilisateurDe(idA, managerA, "MANAGER")));
    expect(liste.map((p) => p.id)).toEqual([l2]);
  });

  test("passer un lead au statut Qualifié le fait entrer dans la liste (qualifieLe posé), le quitter l'en retire (qualifieLe vidé)", async () => {
    connecter(idA, adminA, "ADMIN");
    await changerStatutLead(l3, "QUALIFIE");
    expect((await leadDe(idA, l3)).qualifieLe).not.toBeNull();
    let liste = await avecEntreprise(idA, (tx) => listerProspectsQualifies(tx, utilisateurDe(idA, adminA, "ADMIN")));
    expect(liste.map((p) => p.id)).toContain(l3);

    await changerStatutLead(l3, "CONTACTE");
    expect((await leadDe(idA, l3)).qualifieLe).toBeNull();
    liste = await avecEntreprise(idA, (tx) => listerProspectsQualifies(tx, utilisateurDe(idA, adminA, "ADMIN")));
    expect(liste.map((p) => p.id)).not.toContain(l3);
  });

  test("un Manager ne peut pas changer le statut d'un lead hors de sa portée, ni un autre utilisateur celui d'une autre entreprise", async () => {
    connecter(idA, managerA, "MANAGER");
    await changerStatutLead(l1, "DISQUALIFIE");
    expect((await leadDe(idA, l1)).statut).toBe("QUALIFIE");

    connecter(idB, adminB, "ADMIN");
    await changerStatutLead(l1, "DISQUALIFIE"); // l1 appartient à A : invisible pour B (RLS)
    expect((await leadDe(idA, l1)).statut).toBe("QUALIFIE");
  });
});

describe("Prospects qualifiés — relance par e-mail", () => {
  test("l'e-mail part, avec l'adresse relue en base ; la relance est notée dans l'historique et dans les e-mails envoyés (sans contact)", async () => {
    envoyerEmailMock.mockClear();
    connecter(idA, adminA, "ADMIN");
    const r = await relancerProspectParEmail(null, formulaire({ leadId: l1, objet: "Suite à notre échange", message: "Bonjour Prospect Un, je reviens vers vous." }));
    expect(r).toEqual({ envoye: true });
    expect(envoyerEmailMock).toHaveBeenCalledTimes(1);
    expect(envoyerEmailMock.mock.calls[0][0].to).toBe(`p1-${suffixe}@client.test`);

    const relances = await relancesDe(idA, l1);
    expect(relances).toHaveLength(1);
    expect(relances[0].canal).toBe("email");
    expect(relances[0].contenu).toContain("je reviens vers vous");
    expect(relances[0].auteurId).toBe(adminA);

    const souches = await avecEntreprise(idA, (tx) => tx.select().from(emailEnvoye).where(eq(emailEnvoye.destinataire, `p1-${suffixe}@client.test`)));
    expect(souches).toHaveLength(1);
    expect(souches[0].contactId).toBeNull();
    expect(souches[0].type).toBe("PROSPECT");
  });

  test("refus : prospect sans adresse, texte avec un élément « [à compléter] », champ trop court, prospect hors portée ou d'une autre entreprise — aucun e-mail ne part", async () => {
    envoyerEmailMock.mockClear();
    connecter(idA, adminA, "ADMIN");
    expect((await relancerProspectParEmail(null, formulaire({ leadId: l5, objet: "Bonjour", message: "Un message assez long." })))?.erreur).toMatch(/adresse e-mail/);
    expect((await relancerProspectParEmail(null, formulaire({ leadId: l1, objet: "Bonjour", message: "Voici le lien : [lien de suivi]" })))?.erreur).toMatch(/Complétez ou retirez/);
    expect((await relancerProspectParEmail(null, formulaire({ leadId: l1, objet: "Bonjour", message: "ok" })))?.erreur).toMatch(/trop court/);

    connecter(idA, managerA, "MANAGER"); // l1 appartient à l'Admin A : hors de la portée du Manager
    expect((await relancerProspectParEmail(null, formulaire({ leadId: l1, objet: "Bonjour", message: "Un message assez long." })))?.erreur).toMatch(/introuvable/i);

    connecter(idB, adminB, "ADMIN"); // l1 appartient à l'entreprise A : invisible
    expect((await relancerProspectParEmail(null, formulaire({ leadId: l1, objet: "Bonjour", message: "Un message assez long." })))?.erreur).toMatch(/introuvable/i);

    expect(envoyerEmailMock).not.toHaveBeenCalled();
    expect(await relancesDe(idA, l5)).toHaveLength(0);
  });

  test("un lead déjà devenu client n'est plus un prospect : on ne le relance plus", async () => {
    envoyerEmailMock.mockClear();
    connecter(idA, adminA, "ADMIN");
    await avecEntreprise(idA, (tx) => tx.update(lead).set({ email: `c4-${suffixe}@client.test` }).where(eq(lead.id, l4)));
    expect((await relancerProspectParEmail(null, formulaire({ leadId: l4, objet: "Bonjour", message: "Un message assez long." })))?.erreur).toMatch(/introuvable/i);
    expect(envoyerEmailMock).not.toHaveBeenCalled();
  });

  test("si l'envoi échoue (service d'e-mail indisponible), rien n'est noté : jamais une relance « envoyée » sans e-mail parti", async () => {
    envoyerEmailMock.mockResolvedValueOnce({ envoye: false });
    connecter(idA, adminA, "ADMIN");
    const avant = (await relancesDe(idA, l2)).length;
    connecter(idA, adminA, "ADMIN");
    const r = await relancerProspectParEmail(null, formulaire({ leadId: l2, objet: "Bonjour", message: "Un message assez long." }));
    expect(r?.erreur).toBeTruthy();
    expect(await relancesDe(idA, l2)).toHaveLength(avant);
  });
});

describe("Prospects qualifiés — WhatsApp, appel/note et rappel", () => {
  test("WhatsApp : renvoie le lien avec le message et note la relance « WhatsApp » ; numéro inutilisable refusé ; autre entreprise refusée", async () => {
    connecter(idA, adminA, "ADMIN");
    const r = await ouvrirRelanceWhatsApp(l1, "Bonjour, un message de test");
    expect(r.lien).toBe("https://wa.me/237690111222?text=Bonjour%2C%20un%20message%20de%20test");
    const relances = (await relancesDe(idA, l1)).filter((x) => x.canal === "whatsapp");
    expect(relances).toHaveLength(1);
    expect(relances[0].contenu).toBe("Bonjour, un message de test");

    expect((await ouvrirRelanceWhatsApp(l5, "Bonjour")).erreur).toMatch(/pas utilisable/);
    expect((await ouvrirRelanceWhatsApp(l1, " ")).erreur).toMatch(/vide/);
    connecter(idB, adminB, "ADMIN");
    expect((await ouvrirRelanceWhatsApp(l1, "Bonjour")).erreur).toMatch(/introuvable/i);
  });

  test("noter un appel ou une remarque l'ajoute à l'historique", async () => {
    connecter(idA, adminA, "ADMIN");
    expect(await noterRelanceProspect(null, formulaire({ leadId: l1, canal: "appel", contenu: "Rappelé, intéressé par le devis." }))).toEqual({ ok: true });
    expect((await noterRelanceProspect(null, formulaire({ leadId: l1, canal: "email", contenu: "Contournement" })))?.erreur).toBeTruthy(); // seul « appel » ou « note » est accepté
    const histo = await avecEntreprise(idA, (tx) => historiqueRelances(tx, l1));
    expect(histo.map((h) => h.canal).sort()).toEqual(["appel", "email", "whatsapp"]);
    expect(histo[0].auteurNom).toBe("Admin A");
  });

  test("le rappel : passé refusé, futur enregistré, au-delà d'un an refusé, retiré ; un rappel échu est honoré (effacé) par la relance suivante", async () => {
    connecter(idA, adminA, "ADMIN");
    const aujourdhui = aujourdhuiDouala();
    expect((await definirRappelProspect(l2, ajouterJours(aujourdhui, -1))).erreur).toMatch(/aujourd'hui ou une date à venir/);
    expect((await definirRappelProspect(l2, ajouterJours(aujourdhui, 400))).erreur).toMatch(/un an/);
    expect((await definirRappelProspect(l2, "pas-une-date")).erreur).toMatch(/invalide/);
    expect(await definirRappelProspect(l2, ajouterJours(aujourdhui, 3))).toEqual({ ok: true });
    expect((await leadDe(idA, l2)).rappelLe).toBe(ajouterJours(aujourdhui, 3));
    expect(await definirRappelProspect(l2, null)).toEqual({ ok: true });
    expect((await leadDe(idA, l2)).rappelLe).toBeNull();

    // Rappel du jour, puis relance : le rappel est honoré.
    expect(await definirRappelProspect(l2, aujourdhui)).toEqual({ ok: true });
    expect((await ouvrirRelanceWhatsApp(l2, "Bonjour Prospect Deux")).lien).toBeTruthy();
    expect((await leadDe(idA, l2)).rappelLe).toBeNull();

    // Une autre entreprise ne peut pas poser de rappel sur ce prospect.
    connecter(idB, adminB, "ADMIN");
    expect((await definirRappelProspect(l2, ajouterJours(aujourdhui, 2))).erreur).toMatch(/introuvable/i);
  });
});

describe("Prospects qualifiés — devenir client", () => {
  test("refus : un lead non qualifié, un prospect hors portée, une autre entreprise — aucun contact n'est créé", async () => {
    connecter(idA, adminA, "ADMIN");
    expect(((await devenirClient(l3)) as { erreur: string }).erreur).toMatch(/Qualifiez d'abord/);
    connecter(idA, managerA, "MANAGER");
    expect(((await devenirClient(l1)) as { erreur: string }).erreur).toMatch(/introuvable/i);
    connecter(idB, adminB, "ADMIN");
    expect(((await devenirClient(l1)) as { erreur: string }).erreur).toMatch(/introuvable/i);
    const contacts = await avecEntreprise(idA, (tx) => tx.select().from(contact).where(eq(contact.entrepriseId, idA)));
    expect(contacts).toHaveLength(0);
    expect((await leadDe(idA, l1)).convertiLe).toBeNull();
  });

  test("un prospect qualifié devient client : contact + opportunité créés, le lead sort de la liste, et il ne peut pas le redevenir", async () => {
    connecter(idA, adminA, "ADMIN");
    let redirection = "";
    try {
      await devenirClient(l1);
    } catch (e) {
      redirection = (e as Error).message;
    }
    expect(redirection).toMatch(/^REDIRECT \/app\/contacts\//);

    const apres = await leadDe(idA, l1);
    expect(apres.convertiLe).not.toBeNull();
    expect(apres.contactConvertiId).toBeTruthy();
    const [leContact] = await avecEntreprise(idA, (tx) => tx.select().from(contact).where(eq(contact.id, apres.contactConvertiId!)));
    expect(leContact.nom).toBe("Prospect Un");
    expect(leContact.telephone).toBe("690 11 12 22");
    const opportunites = await avecEntreprise(idA, (tx) => tx.select().from(deal).where(eq(deal.contactId, leContact.id)));
    expect(opportunites).toHaveLength(1);

    const liste = await avecEntreprise(idA, (tx) => listerProspectsQualifies(tx, utilisateurDe(idA, adminA, "ADMIN")));
    expect(liste.map((p) => p.id)).not.toContain(l1);

    expect(((await devenirClient(l1)) as { erreur: string }).erreur).toMatch(/déjà devenu client/);
    const encore = await avecEntreprise(idA, (tx) => tx.select().from(contact).where(eq(contact.entrepriseId, idA)));
    expect(encore).toHaveLength(1);
  });
});

describe("Prospects qualifiés — étanchéité entre entreprises (relance_prospect)", () => {
  test("une entreprise ne lit jamais les relances d'une autre, et ne peut pas en écrire dans le compte d'une autre", async () => {
    const chezA = await avecEntreprise(idA, (tx) => tx.select().from(relanceProspect));
    expect(chezA.length).toBeGreaterThan(0);
    expect(chezA.every((r) => r.entrepriseId === idA)).toBe(true);

    const chezB = await avecEntreprise(idB, (tx) => tx.select().from(relanceProspect));
    expect(chezB).toHaveLength(0);

    // Depuis le contexte de B, écrire une ligne au nom de A est refusé par la politique RLS (WITH CHECK).
    await expect(
      avecEntreprise(idB, (tx) => tx.insert(relanceProspect).values({ entrepriseId: idA, leadId: l2, canal: "note", contenu: "intrusion" }))
    ).rejects.toThrow();
    // Et dans son propre contexte, rattacher une relance à un lead d'une autre entreprise ne se voit jamais côté A.
    expect((await relancesDe(idA, l2)).some((r) => r.contenu === "intrusion")).toBe(false);
  });

  test("supprimer un lead supprime aussi son historique de relances", async () => {
    connecter(idA, adminA, "ADMIN");
    await noterRelanceProspect(null, formulaire({ leadId: l2, canal: "note", contenu: "à supprimer avec le lead" }));
    expect((await relancesDe(idA, l2)).length).toBeGreaterThan(0);
    const r = await avecEntreprise(idA, (tx) => supprimerLeadEnBase(tx, l2));
    expect(r.supprime).toBe(true);
    expect(await relancesDe(idA, l2)).toHaveLength(0);
  });
});

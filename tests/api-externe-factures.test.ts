import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, facture, ligneFacture, paiement, cleApiEntreprise, ecritureComptable, compteComptable, emailEnvoye } from "@/db/schema";
import { genererCle } from "@/lib/api-externe/cle";
import { reinitialiserLimites } from "@/lib/api-externe/limite";
import { ventilerMontantTTC } from "@/lib/api-externe/facture";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// L'envoi du reçu part « après la réponse » : on garde les tâches pour attendre leur fin avant de vérifier.
const taches = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock("next/server", async () => {
  const reel = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...reel, after: (fn: () => unknown) => { taches.push(Promise.resolve().then(fn)); } };
});
type Courrier = { to: string; subject: string; html: string; attachments?: { filename: string; content: Buffer }[]; nomExpediteur?: string };
const envoyerEmail = vi.fn<(p: Courrier) => Promise<{ envoye: boolean }>>();
vi.mock("@/lib/email/client", () => ({ envoyerEmail: (p: Courrier) => envoyerEmail(p) }));
vi.mock("@/lib/pdf/logo", async (original) => ({ ...(await original<typeof import("@/lib/pdf/logo")>()), logoPourPDF: async () => null }));

const { POST } = await import("@/app/api/externe/factures/route");

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST FactureExterne A ${suffixe}`;
const nomB = `TEST FactureExterne B ${suffixe}`;
const emailAdminA = `admin-a-${suffixe}@vertexone.test`;
const emailAdminB = `admin-b-${suffixe}@vertexone.test`;
let idA = "", idB = "", adminA = "", adminB = "";
let cleA = "", cleASansDroit = "", cleRevoquee = "", cleB = "";
let n = 0;

async function creerCle(entrepriseId: string, creeParId: string, options: { facturation: boolean; revoquee?: boolean }) {
  const { cle, prefixe, empreinte } = genererCle();
  await avecEntreprise(entrepriseId, (tx) =>
    tx.insert(cleApiEntreprise).values({ entrepriseId, nom: "Site test", prefixe, empreinte, creeParId, autoriseFacturation: options.facturation, revoqueeLe: options.revoquee ? new Date() : null })
  );
  return cle;
}

function appeler(cle: string | null, corps: unknown, brut?: string) {
  return POST(
    new Request("http://localhost/api/externe/factures", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cle ? { Authorization: `Bearer ${cle}` } : {}) },
      body: brut ?? JSON.stringify(corps),
    })
  );
}
async function creer(cle: string, surcharge: Record<string, unknown> = {}) {
  n += 1;
  const corps = {
    source: "Site test",
    reference: `demande-${suffixe}-${n}`,
    client: { nom: "Linda Mballa", email: `linda-${suffixe}@exemple.test`, telephone: "+237 690 11 12 22" },
    designation: "Ouverture de dossier visa",
    montantTTC: 30000,
    operateur: "MTN_Cameroon",
    ...surcharge,
  };
  const r = await appeler(cle, corps);
  await Promise.all(taches.splice(0)); // les emails envoyés après la réponse sont partis
  return { statut: r.status, corps: (await r.json()) as Record<string, unknown>, envoye: corps };
}
const facturesDe = (entrepriseId: string) => avecEntreprise(entrepriseId, (tx) => tx.select().from(facture).where(eq(facture.entrepriseId, entrepriseId)));
const contactsDe = (entrepriseId: string) => avecEntreprise(entrepriseId, (tx) => tx.select().from(contact).where(eq(contact.entrepriseId, entrepriseId)));
const courriers = (a: string) => envoyerEmail.mock.calls.map((c) => c[0]).filter((c) => c.to === a);

beforeAll(async () => {
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence", assujettiTVA: true }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence", assujettiTVA: false }).returning({ id: entreprise.id });
  idA = a.id;
  idB = b.id;
  [{ id: adminA }] = await db.insert(utilisateur).values({ entrepriseId: idA, email: emailAdminA, nomComplet: "Admin A", role: "ADMIN", statut: "ACTIF" }).returning({ id: utilisateur.id });
  [{ id: adminB }] = await db.insert(utilisateur).values({ entrepriseId: idB, email: emailAdminB, nomComplet: "Admin B", role: "ADMIN", statut: "ACTIF" }).returning({ id: utilisateur.id });
  cleA = await creerCle(idA, adminA, { facturation: true });
  cleASansDroit = await creerCle(idA, adminA, { facturation: false });
  cleRevoquee = await creerCle(idA, adminA, { facturation: true, revoquee: true });
  cleB = await creerCle(idB, adminB, { facturation: true });
}, 180_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 180_000);

beforeEach(() => {
  envoyerEmail.mockReset();
  envoyerEmail.mockResolvedValue({ envoye: true });
  reinitialiserLimites();
});

describe("ventilation du montant TTC", () => {
  test("HT + TVA = TTC exactement, et rien quand l'entreprise n'est pas assujettie", () => {
    for (const ttc of [100, 1000, 11925, 30000, 49999, 123457, 99_999_999]) {
      const v = ventilerMontantTTC(ttc, true);
      expect(v.montantHT + v.montantTVA, String(ttc)).toBe(ttc);
      expect(v.tauxTVA).toBe(19.25);
    }
    expect(ventilerMontantTTC(30000, true)).toMatchObject({ montantHT: 25157, montantTVA: 4843 });
    expect(ventilerMontantTTC(30000, false)).toEqual({ montantHT: 30000, montantTVA: 0, tauxTVA: 0 });
  });
});

describe("POST /api/externe/factures — accès", () => {
  const corps = { reference: "x", client: { nom: "Linda" }, designation: "Test", montantTTC: 1000 };

  test("sans clé, clé mal formée, inconnue ou révoquée : toujours la même réponse 401", async () => {
    for (const cle of [null, "vo_court", `vo_${"a".repeat(43)}`, cleRevoquee]) {
      const r = await appeler(cle, corps);
      expect(r.status, String(cle)).toBe(401);
      expect((await r.json()).erreur).toBe("Clé d'API invalide.");
    }
    expect(await facturesDe(idA)).toHaveLength(0);
  }, 240_000);

  test("une clé valide mais non autorisée à facturer reçoit 403 et rien n'est créé", async () => {
    const r = await creer(cleASansDroit);
    expect(r.statut).toBe(403);
    expect(await facturesDe(idA)).toHaveLength(0);
    expect(await contactsDe(idA)).toHaveLength(0);
    expect(envoyerEmail).not.toHaveBeenCalled();
  }, 240_000);
});

describe("POST /api/externe/factures — création", () => {
  test("une facture PAYÉE est émise : numéro, TVA, ligne, règlement, écritures équilibrées, contact créé", async () => {
    const r = await creer(cleA);
    expect(r.statut).toBe(201);
    expect(r.corps).toMatchObject({ doublon: false });
    expect(String(r.corps.numero)).toMatch(/^FAC-\d{4}-\d{6}$/);
    expect(String(r.corps.urlFacture)).toMatch(/\/facture\/[A-Za-z0-9]{32}$/);
    expect(String(r.corps.urlPdf)).toMatch(/\/facture\/[A-Za-z0-9]{32}\/pdf$/);

    const [f] = await facturesDe(idA);
    expect(f).toMatchObject({ numero: r.corps.numero, statut: "PAYEE", montantTTC: 30000, montantHT: 25157, montantTVA: 4843, reponseClient: "ACCEPTEE" });
    const lignes = await avecEntreprise(idA, (tx) => tx.select().from(ligneFacture).where(eq(ligneFacture.factureId, f.id)));
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ designation: "Ouverture de dossier visa", prixUnitaire: 25157, tauxTVA: 19.25 });
    const reglements = await avecEntreprise(idA, (tx) => tx.select().from(paiement).where(eq(paiement.factureId, f.id)));
    expect(reglements).toHaveLength(1);
    expect(reglements[0]).toMatchObject({ montant: 30000, moyenPaiement: "mtn_momo", referenceTransaction: `ext:Site test:${r.envoye.reference}` });

    const ecritures = await avecEntreprise(idA, (tx) =>
      tx.select({ numero: compteComptable.numero, debit: ecritureComptable.debit, credit: ecritureComptable.credit }).from(ecritureComptable).innerJoin(compteComptable, eq(compteComptable.id, ecritureComptable.compteId)).where(eq(ecritureComptable.entrepriseId, idA))
    );
    expect(ecritures.reduce((s, e) => s + e.debit, 0)).toBe(ecritures.reduce((s, e) => s + e.credit, 0)); // équilibré
    expect(ecritures.find((e) => e.numero === "706000")?.credit).toBe(25157);
    expect(ecritures.find((e) => e.numero === "443200")?.credit).toBe(4843);
    expect(ecritures.filter((e) => e.numero === "411000").reduce((s, e) => s + e.debit - e.credit, 0)).toBe(0); // la créance est soldée par le règlement
    expect(ecritures.find((e) => e.numero === "512000")?.debit).toBe(30000);

    const contacts = await contactsDe(idA);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ nom: "Linda Mballa", email: `linda-${suffixe}@exemple.test`, assigneAId: adminA });
  }, 240_000);

  test("le client reçoit la facture au nom de l'entreprise (PDF joint), l'Administrateur est prévenu, l'historique du contact le garde", async () => {
    // Les emails de la création précédente (même test file) ont déjà été vérifiés ci-dessus : on en refait un propre.
    const r = await creer(cleA, { client: { nom: "Eve Nkodo", email: `eve-${suffixe}@exemple.test`, telephone: "+237 677 00 00 01" } });
    expect(r.statut).toBe(201);
    const recu = courriers(`eve-${suffixe}@exemple.test`);
    expect(recu).toHaveLength(1);
    expect(recu[0].nomExpediteur).toBe(nomA);
    expect(recu[0].subject).toMatch(/réglée/);
    expect(recu[0].attachments).toHaveLength(1);
    expect(recu[0].attachments![0].filename).toBe(`${r.corps.numero}.pdf`);
    expect(recu[0].attachments![0].content.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(recu[0].html).toContain("Eve Nkodo");
    const admin = courriers(emailAdminA);
    expect(admin.length).toBeGreaterThan(0);
    expect(admin[admin.length - 1].html).toContain("Eve Nkodo");
    const [cEve] = (await contactsDe(idA)).filter((c) => c.nom === "Eve Nkodo");
    const journal = await avecEntreprise(idA, (tx) => tx.select().from(emailEnvoye).where(eq(emailEnvoye.contactId, cEve.id)));
    expect(journal).toHaveLength(1);
  }, 240_000);

  test("entreprise non assujettie à la TVA : HT = TTC, aucune ligne de TVA dans la comptabilité", async () => {
    const r = await creer(cleB, { montantTTC: 12000 });
    expect(r.statut).toBe(201);
    const [f] = await facturesDe(idB);
    expect(f).toMatchObject({ montantHT: 12000, montantTVA: 0, montantTTC: 12000 });
    const tva = await avecEntreprise(idB, (tx) =>
      tx.select({ numero: compteComptable.numero }).from(ecritureComptable).innerJoin(compteComptable, eq(compteComptable.id, ecritureComptable.compteId)).where(and(eq(ecritureComptable.entrepriseId, idB), eq(compteComptable.numero, "443200")))
    );
    expect(tva).toHaveLength(0);
  }, 240_000);

  test("un même paiement renvoyé ne crée jamais une seconde facture ; deux appels simultanés non plus", async () => {
    const avant = (await facturesDe(idA)).length;
    const reference = `idem-${suffixe}`;
    const premier = await creer(cleA, { reference });
    expect(premier.statut).toBe(201);
    const envoyesApres = envoyerEmail.mock.calls.length;

    const second = await creer(cleA, { reference });
    expect(second.statut).toBe(200);
    expect(second.corps).toMatchObject({ doublon: true, numero: premier.corps.numero });
    expect(envoyerEmail.mock.calls.length).toBe(envoyesApres); // aucun second reçu

    const refSimultanee = `simul-${suffixe}`;
    const [x, y] = await Promise.all([creer(cleA, { reference: refSimultanee }), creer(cleA, { reference: refSimultanee })]);
    expect([x.statut, y.statut].sort()).toEqual([200, 201]);
    expect(x.corps.numero).toBe(y.corps.numero);

    expect((await facturesDe(idA)).length).toBe(avant + 2); // une pour « idem », une pour « simul »
  }, 240_000);

  test("un client déjà connu (email ou téléphone, quel que soit le format) garde sa fiche ; les numéros se suivent sans trou", async () => {
    const avantContacts = (await contactsDe(idA)).length;
    const mail = `connu-${suffixe}@exemple.test`;
    const p1 = await creer(cleA, { client: { nom: "Paul Biya Jr", email: mail, telephone: "+237 655 44 33 22" } });
    const p2 = await creer(cleA, { client: { nom: "Paul B.", email: mail.toUpperCase(), telephone: "" } }); // même email, casse différente
    const p3 = await creer(cleA, { client: { nom: "Paul encore", email: "", telephone: "655443322" } }); // même téléphone, autre format
    expect([p1.statut, p2.statut, p3.statut]).toEqual([201, 201, 201]);
    expect((await contactsDe(idA)).length).toBe(avantContacts + 1);

    const compteur = (numero: unknown) => Number(String(numero).split("-")[2]);
    expect(compteur(p2.corps.numero)).toBe(compteur(p1.corps.numero) + 1);
    expect(compteur(p3.corps.numero)).toBe(compteur(p2.corps.numero) + 1);
  }, 240_000);

  test("une facture d'une entreprise n'apparaît jamais chez une autre, même client identique", async () => {
    const avantB = (await facturesDe(idB)).length;
    const mail = `partage-${suffixe}@exemple.test`;
    await creer(cleA, { client: { nom: "Client Partagé", email: mail } });
    expect((await facturesDe(idB)).length).toBe(avantB);
    expect((await contactsDe(idB)).filter((c) => c.email === mail)).toHaveLength(0);
    await creer(cleB, { client: { nom: "Client Partagé", email: mail } });
    expect((await contactsDe(idB)).filter((c) => c.email === mail)).toHaveLength(1);
    expect((await contactsDe(idA)).filter((c) => c.email === mail)).toHaveLength(1);
    expect(courriers(mail).map((c) => c.nomExpediteur).sort()).toEqual([nomA, nomB].sort());
  }, 240_000);
});

describe("POST /api/externe/factures — données refusées", () => {
  test("montant, référence, client : jamais de facture ni de numéro consommé", async () => {
    const avant = await facturesDe(idA);
    const base = { reference: `inv-${suffixe}`, client: { nom: "Linda Mballa" }, designation: "Test", montantTTC: 5000 };
    const mauvais: Record<string, unknown>[] = [
      { ...base, montantTTC: 5000.5 },
      { ...base, montantTTC: -5000 },
      { ...base, montantTTC: 0 },
      { ...base, montantTTC: 50 },
      { ...base, montantTTC: "5000" },
      { ...base, montantTTC: 200_000_000 },
      { ...base, reference: "" },
      { ...base, client: { nom: "L" } },
      { ...base, client: { nom: "Linda", email: "pas-un-email" } },
      { ...base, designation: "" },
      { ...base, payeLe: "hier" },
    ];
    for (const corps of mauvais) {
      const r = await appeler(cleA, corps);
      expect(r.status, JSON.stringify(corps)).toBe(400);
    }
    expect((await appeler(cleA, null, "{pas du json")).status).toBe(400);
    expect((await appeler(cleA, null, JSON.stringify({ ...base, designation: "x".repeat(20_000) }))).status).toBe(413);
    expect(await facturesDe(idA)).toHaveLength(avant.length);

    const suivante = await creer(cleA);
    const dernier = avant.map((f) => Number(f.numero.split("-")[2])).sort((a, b) => b - a)[0] ?? 0;
    expect(Number(String(suivante.corps.numero).split("-")[2])).toBe(dernier + 1); // aucun numéro perdu par les refus
  }, 240_000);
});

describe("POST /api/externe/factures — cas limites de l'entreprise", () => {
  test("comptabilité verrouillée : la facture est tout de même créée, à la date du jour", async () => {
    await db.update(entreprise).set({ dateVerrouillageComptable: new Date(Date.now() - 86_400_000) }).where(eq(entreprise.id, idA));
    const r = await creer(cleA, { payeLe: new Date(Date.now() - 5 * 86_400_000).toISOString() });
    expect(r.statut).toBe(201);
    const [f] = (await facturesDe(idA)).filter((x) => x.numero === r.corps.numero);
    expect(f.dateEmission.getTime()).toBeGreaterThan(Date.now() - 60_000);
    await db.update(entreprise).set({ dateVerrouillageComptable: null }).where(eq(entreprise.id, idA));
  }, 240_000);

  test("abonnement suspendu : 402 ; aucun administrateur actif : 409 ; rien n'est créé dans les deux cas", async () => {
    const avant = (await facturesDe(idB)).length;
    await db.update(entreprise).set({ statutAbonnement: "suspendu" }).where(eq(entreprise.id, idB));
    expect((await creer(cleB)).statut).toBe(402);
    await db.update(entreprise).set({ statutAbonnement: "actif" }).where(eq(entreprise.id, idB));

    await db.update(utilisateur).set({ statut: "DESACTIVE" }).where(eq(utilisateur.id, adminB));
    expect((await creer(cleB)).statut).toBe(409);
    await db.update(utilisateur).set({ statut: "ACTIF" }).where(eq(utilisateur.id, adminB));
    expect((await facturesDe(idB)).length).toBe(avant);
  }, 240_000);
});

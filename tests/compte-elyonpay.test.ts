import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, facture, paiement, compteElyonpay, tentativePaiementFacture } from "@/db/schema";
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
// Aucun e-mail réel (un paiement confirmé prévient l'Administrateur et le client) ; le réseau vers ElyonPay est simulé plus bas par un faux `fetch`.
vi.mock("@/lib/email/client", () => ({ envoyerEmail: async () => ({ envoye: true }) }));

const { verifierIdentifiants } = await import("@/lib/elyonpay/client");
const { connecterCompteElyonpay, deconnecterCompteElyonpay } = await import("@/lib/actions/compte-elyonpay");
const { lireEtatCompte, lireIdentifiants, compteActif } = await import("@/lib/paiement/compte-elyonpay");
const { declencherPaiementDirectFacture } = await import("@/lib/facturation/paiement-en-ligne");
const { relireEtConfirmerFacture } = await import("@/lib/paiement/confirmation");

// ----- Faux ElyonPay : une clé n'est acceptée que si elle est dans `valides` ; chaque appel est enregistré avec la clé qui l'a fait. -----
const CLE_PLATEFORME = "CLE-PLATEFORME-0001-xxxxxxxx";
const suffixe = Math.random().toString(36).slice(2, 8);
const CLE_A = `pk_live_entreprise_A_${suffixe}_abcd1234`;
const CLE_B = `pk_live_entreprise_B_${suffixe}_wxyz9876`;
type Appel = { methode: string; chemin: string; cle: string; corps: Record<string, unknown> | null };
const appels: Appel[] = [];
const valides = new Set<string>();
const transactions = new Map<string, { state: string; amount: number }>();
let numeroTransaction = 0;
let indisponible = false;

const fetchFaux = vi.fn(async (url: string, init: RequestInit) => {
  const chemin = new URL(url).pathname.replace(/^\/api/, "");
  const cle = String((init.headers as Record<string, string>).Authorization ?? "").replace(/^Bearer /, "");
  const corps = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  appels.push({ methode: String(init.method), chemin, cle, corps });
  const reponse = (statut: number, json: unknown) => ({ ok: statut < 400, status: statut, json: async () => json });
  if (indisponible) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
  if (!valides.has(cle)) return reponse(401, { code: 401, message: "JWT Token not found" });
  if (init.method === "POST" && chemin === "/mobile-money/payment/request") {
    numeroTransaction += 1;
    const uuid = `uuid-${suffixe}-${numeroTransaction}`;
    transactions.set(uuid, { state: "CREATED", amount: Number(corps?.amount) });
    return reponse(200, { success: true, data: { uuid, PSPid: `psp-${numeroTransaction}` } });
  }
  const m = /^\/transactions\/(.+)$/.exec(chemin);
  if (init.method === "GET" && m) {
    const t = transactions.get(decodeURIComponent(m[1]));
    return t ? reponse(200, { data: { state: t.state, amount: t.amount, payment: { name: "MTN_MONEY" } } }) : reponse(404, { message: "Transaction not found" });
  }
  return reponse(404, {});
});

let idA = "", idB = "", adminA = "", managerA = "", adminB = "";
let compteurFacture = 0;
const formulaire = (valeurs: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(valeurs)) f.set(k, v);
  return f;
};
const comme = (entrepriseId: string, utilisateurId: string, role: string) => {
  connecte = { entrepriseId, utilisateurId, role };
};
const compteDe = (entrepriseId: string) => avecEntreprise(entrepriseId, (tx) => tx.select().from(compteElyonpay));
const nouvelleFacture = (entrepriseId: string, adminId: string) =>
  avecEntreprise(entrepriseId, async (tx) => {
    compteurFacture += 1;
    const [c] = await tx.insert(contact).values({ entrepriseId, nom: "Client", telephone: "+237600000000", assigneAId: adminId }).returning({ id: contact.id });
    const [f] = await tx
      .insert(facture)
      .values({ entrepriseId, numero: `FAC-CE-${suffixe}-${compteurFacture}`, contactId: c.id, assigneAId: adminId, dateEcheance: new Date(Date.now() + 30 * 86_400_000), montantHT: 10000, montantTVA: 1925, montantTTC: 11925 })
      .returning({ id: facture.id });
    return f.id;
  });
const payer = (entrepriseId: string, factureId: string) =>
  avecEntreprise(entrepriseId, (tx) => declencherPaiementDirectFacture(tx, { entrepriseId, factureId, telephone: "690 11 12 22", operateur: "MTN_Cameroon" }));
const tentativesDe = (entrepriseId: string, factureId: string) => avecEntreprise(entrepriseId, (tx) => tx.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.factureId, factureId)));

const nomA = `TEST CompteElyon A ${suffixe}`;
const nomB = `TEST CompteElyon B ${suffixe}`;

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
}, 120_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 120_000);

beforeEach(() => {
  appels.length = 0;
  valides.clear();
  [CLE_PLATEFORME, CLE_A, CLE_B].forEach((c) => valides.add(c));
  indisponible = false;
  fetchFaux.mockClear();
  vi.stubGlobal("fetch", fetchFaux);
  vi.stubEnv("ELYONPAY_API_KEY", CLE_PLATEFORME);
  vi.stubEnv("ELYONPAY_MERCHANT_ID", "207");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Vérifier une clé ElyonPay sans rien payer", () => {
  test("clé acceptée (introuvable = 404), refusée (401), service indisponible : trois réponses distinctes ; la clé testée est la seule utilisée", async () => {
    expect(await verifierIdentifiants({ cle: CLE_A, marchandId: 595, nomMarchand: "A" })).toEqual({ valide: true });
    expect(await verifierIdentifiants({ cle: "cle-inconnue-0000000000", marchandId: 595, nomMarchand: "A" })).toEqual({ valide: false, refusee: true, indisponible: false });
    indisponible = true;
    expect(await verifierIdentifiants({ cle: CLE_A, marchandId: 595, nomMarchand: "A" })).toEqual({ valide: false, refusee: false, indisponible: true });
    // Chaque sonde est une LECTURE d'une transaction qui n'existe pas : aucun paiement, et jamais la clé de la plateforme.
    expect(appels.every((a) => a.methode === "GET" && a.chemin.startsWith("/transactions/"))).toBe(true);
    expect(appels.some((a) => a.cle === CLE_PLATEFORME)).toBe(false);
  });
});

describe("Brancher le compte ElyonPay d'une entreprise", () => {
  test("la clé est testée, puis chiffrée : jamais en clair en base, jamais renvoyée à l'écran ; seuls ses 4 derniers caractères sont visibles", async () => {
    comme(idA, adminA, "ADMIN");
    const r = await connecterCompteElyonpay(null, formulaire({ marchandId: "595", nomMarchand: "Garage Mbarga", cle: CLE_A }));
    expect(r).toEqual({ ok: true });
    expect(appels).toHaveLength(1); // une seule sonde de vérification, rien d'autre
    expect(appels[0].cle).toBe(CLE_A);

    const [ligne] = await compteDe(idA);
    expect(ligne).toMatchObject({ marchandId: 595, nomMarchand: "Garage Mbarga", statut: "ACTIF", cleFin: CLE_A.slice(-4) });
    expect(ligne.configChiffree).not.toContain(CLE_A);
    expect(ligne.configChiffree).not.toContain("pk_live");
    expect(ligne.configChiffree.startsWith("v1.")).toBe(true);

    const etat = await avecEntreprise(idA, (tx) => lireEtatCompte(tx, idA));
    expect(JSON.stringify(etat)).not.toContain(CLE_A); // ce que l'écran reçoit ne contient pas la clé
    expect(etat).toMatchObject({ statut: "ACTIF", marchandId: 595, cleFin: CLE_A.slice(-4) });
    expect(await avecEntreprise(idA, (tx) => lireIdentifiants(tx, idA))).toEqual({ cle: CLE_A, marchandId: 595, nomMarchand: "Garage Mbarga" });
    expect(await avecEntreprise(idA, (tx) => compteActif(tx, idA))).toBe(true);
  });

  test("une clé refusée par ElyonPay n'est JAMAIS enregistrée ; un service indisponible non plus ; et le message ne répète pas la clé", async () => {
    comme(idB, adminB, "ADMIN");
    const refusee = await connecterCompteElyonpay(null, formulaire({ marchandId: "700", nomMarchand: "Boutique B", cle: "pk_live_cle_invalide_000000000000" }));
    expect(refusee?.erreur).toMatch(/refusé cette clé/);
    expect(JSON.stringify(refusee)).not.toContain("cle_invalide");
    indisponible = true;
    const hors = await connecterCompteElyonpay(null, formulaire({ marchandId: "700", nomMarchand: "Boutique B", cle: CLE_B }));
    expect(hors?.erreur).toMatch(/Impossible de joindre ElyonPay/);
    expect(await compteDe(idB)).toHaveLength(0);
  });

  test("champs invalides refusés avant tout appel à ElyonPay ; seul l'Administrateur peut brancher", async () => {
    comme(idB, adminB, "ADMIN");
    for (const [valeurs, motif] of [
      [{ marchandId: "abc", nomMarchand: "Boutique B", cle: CLE_B }, /identifiant marchand est un nombre/],
      [{ marchandId: "700", nomMarchand: "Boutique B", cle: "trop-courte" }, /trop courte/],
      [{ marchandId: "700", nomMarchand: "Boutique B", cle: `${CLE_B} avec espace` }, /ni espace/],
      [{ marchandId: "700", nomMarchand: "B", cle: CLE_B }, /trop court/], // nom affiché d'un seul caractère
    ] as const) {
      expect((await connecterCompteElyonpay(null, formulaire(valeurs)))?.erreur).toMatch(motif);
    }
    expect(appels).toHaveLength(0);

    comme(idA, managerA, "MANAGER");
    expect((await connecterCompteElyonpay(null, formulaire({ marchandId: "595", nomMarchand: "Garage", cle: CLE_A })))?.erreur).toMatch(/Seul l'Administrateur/);
    expect((await deconnecterCompteElyonpay())?.erreur).toMatch(/Seul l'Administrateur/);
  });

  test("étanchéité : une entreprise ne lit jamais le compte d'une autre", async () => {
    // Le compte de A existe ; depuis le contexte de B on ne le voit pas, ni ses identifiants.
    expect(await avecEntreprise(idB, (tx) => tx.select().from(compteElyonpay))).toHaveLength(0);
    expect(await avecEntreprise(idB, (tx) => lireIdentifiants(tx, idA))).toBeNull();
    expect(await avecEntreprise(idB, (tx) => lireEtatCompte(tx, idA))).toBeNull();
    // Et B ne peut pas écrire un compte au nom de A.
    await expect(
      avecEntreprise(idB, (tx) => tx.insert(compteElyonpay).values({ entrepriseId: idA, marchandId: 1, nomMarchand: "x", configChiffree: "x", cleFin: "0000" })),
    ).rejects.toThrow();
  });

  test("un paiement en cours bloque le changement et le retrait du compte ; une fois ancien, plus rien ne bloque", async () => {
    comme(idA, adminA, "ADMIN");
    const f = await nouvelleFacture(idA, adminA);
    const [t] = await avecEntreprise(idA, (tx) => tx.insert(tentativePaiementFacture).values({ entrepriseId: idA, factureId: f, montant: 5000, compte: "ENTREPRISE" }).returning({ id: tentativePaiementFacture.id }));
    expect((await connecterCompteElyonpay(null, formulaire({ marchandId: "595", nomMarchand: "Garage", cle: CLE_A })))?.erreur).toMatch(/paiement est en cours/);
    expect((await deconnecterCompteElyonpay())?.erreur).toMatch(/paiement est en cours/);
    expect(await compteDe(idA)).toHaveLength(1);

    await avecEntreprise(idA, (tx) => tx.update(tentativePaiementFacture).set({ creeLe: new Date(Date.now() - 2 * 3_600_000) }).where(eq(tentativePaiementFacture.id, t.id)));
    expect(await connecterCompteElyonpay(null, formulaire({ marchandId: "595", nomMarchand: "Garage Mbarga", cle: CLE_A }))).toEqual({ ok: true });
  });
});

describe("Payer une facture : l'argent suit le compte de l'ENTREPRISE", () => {
  test("sans compte branché : aucun paiement, aucune tentative, aucun appel à ElyonPay — jamais un repli sur le compte de la plateforme", async () => {
    const f = await nouvelleFacture(idB, adminB);
    const r = await payer(idB, f);
    expect(r.erreur).toMatch(/pas activé pour cette entreprise/);
    expect(appels).toHaveLength(0);
    expect(await tentativesDe(idB, f)).toHaveLength(0);
  });

  test("avec un compte : la demande part avec l'identifiant marchand, le nom et la clé de l'ENTREPRISE (jamais ceux de la plateforme) ; la tentative est marquée « ENTREPRISE »", async () => {
    const f = await nouvelleFacture(idA, adminA);
    const r = await payer(idA, f);
    expect(r.erreur).toBeUndefined();
    const demande = appels.find((a) => a.methode === "POST")!;
    expect(demande.chemin).toBe("/mobile-money/payment/request");
    expect(demande.cle).toBe(CLE_A);
    expect(demande.cle).not.toBe(CLE_PLATEFORME);
    expect(demande.corps).toMatchObject({ merchant_id: 595, merchant_name: "Garage Mbarga", amount: 11925, currency: "XAF", customer_msisdn: "+237690111222", payment_method: "MTN_MONEY" });
    expect(demande.corps).not.toHaveProperty("transaction"); // jamais envoyé : ElyonPay le lit comme l'identifiant d'une transaction existante
    expect(appels.some((a) => a.cle === CLE_PLATEFORME)).toBe(false);

    const [t] = await tentativesDe(idA, f);
    expect(t).toMatchObject({ compte: "ENTREPRISE", statut: "EN_ATTENTE", montant: 11925 });
    expect(t.payToken).toMatch(/^uuid-/);
  });

  test("la confirmation relit la transaction avec la clé de l'entreprise, enregistre le règlement, et ne confirme jamais un montant inattendu", async () => {
    const f = await nouvelleFacture(idA, adminA);
    await payer(idA, f);
    const [t] = await tentativesDe(idA, f);

    // Pas encore validé sur le téléphone : toujours en attente.
    appels.length = 0;
    expect(await relireEtConfirmerFacture(t.id)).toBe("EN_ATTENTE");
    expect(appels[0]).toMatchObject({ methode: "GET", cle: CLE_A });

    // Montant différent chez ElyonPay : jamais confirmé.
    transactions.set(t.payToken!, { state: "DELIVERED", amount: 1 });
    expect(await relireEtConfirmerFacture(t.id)).toBe("EN_ATTENTE");
    expect((await avecEntreprise(idA, (tx) => tx.select().from(paiement).where(eq(paiement.factureId, f)))).length).toBe(0);

    // Payé pour de bon, au bon montant.
    transactions.set(t.payToken!, { state: "DELIVERED", amount: 11925 });
    expect(await relireEtConfirmerFacture(t.id)).toBe("CONFIRME");
    const reglements = await avecEntreprise(idA, (tx) => tx.select().from(paiement).where(eq(paiement.factureId, f)));
    expect(reglements).toHaveLength(1);
    expect(reglements[0].montant).toBe(11925);
    expect(await relireEtConfirmerFacture(t.id)).toBe("CONFIRME"); // idempotent : pas de second règlement
    expect(await avecEntreprise(idA, (tx) => tx.select().from(paiement).where(eq(paiement.factureId, f)))).toHaveLength(1);
  });

  test("une ancienne tentative « PLATEFORME » (d'avant ce changement) se relit encore avec le compte de la plateforme", async () => {
    const f = await nouvelleFacture(idA, adminA);
    transactions.set(`legacy-${suffixe}-1`, { state: "CREATED", amount: 11925 });
    const [t] = await avecEntreprise(idA, (tx) =>
      tx.insert(tentativePaiementFacture).values({ entrepriseId: idA, factureId: f, montant: 11925, payToken: `legacy-${suffixe}-1` }).returning({ id: tentativePaiementFacture.id }),
    );
    expect((await tentativesDe(idA, f))[0].compte).toBe("PLATEFORME");
    appels.length = 0;
    expect(await relireEtConfirmerFacture(t.id)).toBe("EN_ATTENTE");
    expect(appels[0]).toMatchObject({ methode: "GET", cle: CLE_PLATEFORME });
  });

  test("compte retiré pendant qu'une tentative court : impossible de la relire (« indisponible »), jamais une confirmation ni un appel avec une autre clé", async () => {
    const f = await nouvelleFacture(idA, adminA);
    await payer(idA, f);
    const [t] = await tentativesDe(idA, f);
    await avecEntreprise(idA, (tx) => tx.delete(compteElyonpay).where(eq(compteElyonpay.entrepriseId, idA)));
    appels.length = 0;
    expect(await relireEtConfirmerFacture(t.id)).toBe("INDISPONIBLE");
    expect(appels).toHaveLength(0);
    // Remise en place pour la suite (les paiements en attente des tests précédents sont vieillis : un paiement en cours bloquerait la reconnexion).
    comme(idA, adminA, "ADMIN");
    await avecEntreprise(idA, (tx) => tx.update(tentativePaiementFacture).set({ creeLe: new Date(Date.now() - 2 * 3_600_000) }).where(eq(tentativePaiementFacture.entrepriseId, idA)));
    expect(await connecterCompteElyonpay(null, formulaire({ marchandId: "595", nomMarchand: "Garage Mbarga", cle: CLE_A }))).toEqual({ ok: true });
  });

  test("ElyonPay refuse la clé de l'entreprise à la relecture : le compte passe « ERREUR », le paiement en ligne est suspendu, puis rétabli en reconnectant", async () => {
    const f = await nouvelleFacture(idA, adminA);
    await payer(idA, f);
    const [t] = await tentativesDe(idA, f);

    valides.delete(CLE_A); // clé régénérée ou révoquée chez ElyonPay
    expect(await relireEtConfirmerFacture(t.id)).toBe("INDISPONIBLE");
    const [apres] = await compteDe(idA);
    expect(apres.statut).toBe("ERREUR");
    expect(apres.derniereErreur).toMatch(/refusé la clé/);

    // Suspendu : plus aucun paiement possible, aucun appel parti.
    appels.length = 0;
    const f2 = await nouvelleFacture(idA, adminA);
    expect((await payer(idA, f2)).erreur).toMatch(/pas activé/);
    expect(appels).toHaveLength(0);
    expect(await avecEntreprise(idA, (tx) => compteActif(tx, idA))).toBe(false);
    expect(await avecEntreprise(idA, (tx) => lireEtatCompte(tx, idA))).toMatchObject({ statut: "ERREUR" });

    // L'Administrateur entre la nouvelle clé : tout repart.
    const NOUVELLE = `pk_live_nouvelle_cle_${suffixe}_zzzz`;
    valides.add(NOUVELLE);
    comme(idA, adminA, "ADMIN");
    await avecEntreprise(idA, (tx) => tx.update(tentativePaiementFacture).set({ creeLe: new Date(Date.now() - 2 * 3_600_000) }).where(eq(tentativePaiementFacture.entrepriseId, idA)));
    expect(await connecterCompteElyonpay(null, formulaire({ marchandId: "595", nomMarchand: "Garage Mbarga", cle: NOUVELLE }))).toEqual({ ok: true });
    expect((await compteDe(idA))[0]).toMatchObject({ statut: "ACTIF", derniereErreur: null, cleFin: NOUVELLE.slice(-4) });
    const f3 = await nouvelleFacture(idA, adminA);
    appels.length = 0;
    expect((await payer(idA, f3)).erreur).toBeUndefined();
    expect(appels.find((a) => a.methode === "POST")!.cle).toBe(NOUVELLE);
  });

  test("retirer le compte : le paiement en ligne n'est plus proposé", async () => {
    comme(idA, adminA, "ADMIN");
    await avecEntreprise(idA, (tx) => tx.update(tentativePaiementFacture).set({ creeLe: new Date(Date.now() - 2 * 3_600_000) }).where(eq(tentativePaiementFacture.entrepriseId, idA)));
    expect(await deconnecterCompteElyonpay()).toEqual({ ok: true });
    expect(await compteDe(idA)).toHaveLength(0);
    const f = await nouvelleFacture(idA, adminA);
    expect((await payer(idA, f)).erreur).toMatch(/pas activé/);
  });
});

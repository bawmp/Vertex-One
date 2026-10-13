import { createHmac } from "node:crypto";
import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { connexionFacebook, entreprise, lead, routageFacebookPage, utilisateur } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

// Secret d'application de test : toutes les clés de chiffrement et de signature en sont dérivées.
process.env.META_APP_SECRET = "secret-de-test-facebook-0123456789";
process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN = "jeton-de-verification-test";

// « server-only » interdit l'import hors d'un composant serveur : sans effet pour un test Node.
vi.mock("server-only", () => ({}));
const envoyerEmail = vi.fn(async (_p: { to: string; subject: string; html: string }) => ({ envoye: true }));
vi.mock("@/lib/email/client", () => ({ envoyerEmail: (p: { to: string; subject: string; html: string }) => envoyerEmail(p) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async () => {
  const reel = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...reel, after: (fn: () => unknown) => void fn() };
});

// Seul l'appel réseau vers l'API Graph est simulé : base, RLS et création de lead sont réels.
const lireProspect = vi.fn();
vi.mock("@/lib/facebook/graph", async () => {
  const reel = await vi.importActual<typeof import("@/lib/facebook/graph")>("@/lib/facebook/graph");
  return { ...reel, lireProspect: (...args: unknown[]) => lireProspect(...args) };
});

const { CONTEXTE_JETON_PAGE, chiffrer, dechiffrer, creerEtat, verifierEtat, signatureWebhookValide } = await import("@/lib/facebook/jetons");
const { leadDepuisProspectFacebook } = await import("@/lib/facebook/prospect");
const { evenementsLeadgen } = await import("@/lib/facebook/evenements");
const { traiterProspectFacebook } = await import("@/lib/facebook/traitement");
const { POST, GET } = await import("@/app/api/facebook/webhook/route");

describe("jetons et signatures", () => {
  test("un jeton chiffré se relit, n'est jamais en clair, et change à chaque chiffrement", () => {
    const a = chiffrer("EAAB-jeton-secret", CONTEXTE_JETON_PAGE);
    expect(a).not.toContain("EAAB");
    expect(dechiffrer(a, CONTEXTE_JETON_PAGE)).toBe("EAAB-jeton-secret");
    expect(chiffrer("EAAB-jeton-secret", CONTEXTE_JETON_PAGE)).not.toBe(a);
  });

  test("un texte altéré, ou chiffré pour un autre usage, ne se déchiffre jamais", () => {
    const c = chiffrer("secret", CONTEXTE_JETON_PAGE);
    expect(dechiffrer(c, "cookie-pages")).toBeNull();
    expect(dechiffrer(c.slice(0, -3) + "AAA", CONTEXTE_JETON_PAGE)).toBeNull();
    expect(dechiffrer("n'importe quoi", CONTEXTE_JETON_PAGE)).toBeNull();
  });

  test("l'état OAuth est signé, daté et lié à l'utilisateur ; forgé, expiré ou modifié il est refusé", () => {
    const etat = creerEtat("utilisateur-1", "nonce-abc", 1_000_000);
    expect(verifierEtat(etat, 1_000_500)).toEqual({ utilisateurId: "utilisateur-1", nonce: "nonce-abc" });
    expect(verifierEtat(etat, 1_000_000 + 11 * 60 * 1000)).toBeNull(); // expiré
    expect(verifierEtat(etat.slice(0, -2) + "xx", 1_000_500)).toBeNull(); // signature modifiée
    const [corps, signature] = etat.split(".");
    const corpsForge = Buffer.from(Buffer.from(corps, "base64url").toString().replace("utilisateur-1", "pirate-9")).toString("base64url");
    expect(verifierEtat(`${corpsForge}.${signature}`, 1_000_500)).toBeNull(); // corps modifié, même signature
    expect(verifierEtat("rien", 1_000_500)).toBeNull();
  });

  test("la signature d'un webhook Meta est vérifiée sur le corps brut", () => {
    const corps = '{"object":"page"}';
    const bonne = `sha256=${createHmac("sha256", process.env.META_APP_SECRET!).update(corps).digest("hex")}`;
    expect(signatureWebhookValide(corps, bonne)).toBe(true);
    expect(signatureWebhookValide(corps + " ", bonne)).toBe(false);
    expect(signatureWebhookValide(corps, "sha256=00")).toBe(false);
    expect(signatureWebhookValide(corps, null)).toBe(false);
  });
});

describe("conversion d'un prospect Facebook en lead", () => {
  test("reconnaît nom, email, téléphone et société ; garde les autres réponses dans le message", () => {
    const l = leadDepuisProspectFacebook(
      {
        ad_name: "Pub visa Canada",
        form_id: "9988",
        field_data: [
          { name: "full_name", values: ["Awa Ndiaye"] },
          { name: "email", values: ["awa@exemple.com"] },
          { name: "phone_number", values: ["+237690000000"] },
          { name: "company_name", values: ["Awa SARL"] },
          { name: "quel_pays_visez_vous", values: ["Canada"] },
        ],
      },
      "123456789012",
    );
    expect(l).toMatchObject({ nom: "Awa Ndiaye", email: "awa@exemple.com", telephone: "+237690000000", societe: "Awa SARL", source: "Facebook Ads", reference: "facebook-123456789012" });
    expect(l.message).toContain("Quel pays visez vous : Canada");
    expect(l.message).toContain("Publicité : Pub visa Canada");
  });

  test("assemble prénom et nom, remplace un nom absent, écarte un email invalide", () => {
    expect(leadDepuisProspectFacebook({ field_data: [{ name: "first_name", values: ["Jean"] }, { name: "last_name", values: ["Mbarga"] }] }, "11111").nom).toBe("Jean Mbarga");
    const sansNom = leadDepuisProspectFacebook({ field_data: [{ name: "email", values: ["pas-un-email"] }] }, "22222");
    expect(sansNom.nom).toBe("Prospect Facebook");
    expect(sansNom.email).toBeUndefined();
  });

  test("tout est borné (entrée d'un tiers)", () => {
    const enorme = "x".repeat(5000);
    const l = leadDepuisProspectFacebook({ field_data: [{ name: "full_name", values: [enorme] }, { name: "autre", values: [enorme] }] }, "33333");
    expect(l.nom.length).toBeLessThanOrEqual(120);
    expect((l.message ?? "").length).toBeLessThanOrEqual(2000);
  });

  test("seuls les événements « leadgen » de pages, aux identifiants numériques, sont retenus", () => {
    const charge = {
      object: "page",
      entry: [{ changes: [{ field: "leadgen", value: { page_id: "123456", leadgen_id: 987654321 } }, { field: "feed", value: { page_id: "123456", leadgen_id: "5555555" } }, { field: "leadgen", value: { page_id: "../etc", leadgen_id: "1" } }] }],
    };
    expect(evenementsLeadgen(charge)).toEqual([{ pageId: "123456", leadgenId: "987654321" }]);
    expect(evenementsLeadgen({ ...charge, object: "instagram" })).toEqual([]);
  });
});

describe("webhook et traitement — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Facebook A ${suffixe}`;
  const nomB = `TEST Facebook B ${suffixe}`;
  const PAGE_A = `1000${Math.floor(Math.random() * 1e9)}`;
  let idA: string;
  let idB: string;
  let adminA: string;
  let adminB: string;
  let seq = 0;

  const prospect = (nom = "Awa Ndiaye") => ({ id: "x", form_id: "77", field_data: [{ name: "full_name", values: [nom] }, { name: "phone_number", values: ["+237690000000"] }] });
  const nouvelId = () => `${Date.now()}${String(++seq).padStart(4, "0")}`;
  const leadsDe = (id: string) => avecEntreprise(id, (tx) => tx.select().from(lead).where(eq(lead.entrepriseId, id)));

  function requeteSignee(corps: string, signer = true) {
    const signature = `sha256=${createHmac("sha256", process.env.META_APP_SECRET!).update(corps).digest("hex")}`;
    return new Request("https://vertexone.test/api/facebook/webhook", { method: "POST", body: corps, headers: signer ? { "x-hub-signature-256": signature } : {} });
  }
  const charge = (pageId: string, leadgenId: string) => JSON.stringify({ object: "page", entry: [{ changes: [{ field: "leadgen", value: { page_id: pageId, leadgen_id: leadgenId } }] }] });

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    idA = a.id;
    idB = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: idA, email: `admin-fb-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [ub] = await db.insert(utilisateur).values({ entrepriseId: idB, email: `admin-fb-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN" }).returning({ id: utilisateur.id });
    adminA = ua.id;
    adminB = ub.id;
    await avecEntreprise(idA, async (tx) => {
      await tx.insert(routageFacebookPage).values({ entrepriseId: idA, pageId: PAGE_A });
      await tx.insert(connexionFacebook).values({ entrepriseId: idA, pageId: PAGE_A, pageNom: "Page de A", jetonChiffre: chiffrer("jeton-page-a", CONTEXTE_JETON_PAGE), connecteParId: adminA });
    });
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 90_000);

  beforeEach(() => {
    lireProspect.mockReset();
    envoyerEmail.mockClear();
  });

  test("un prospect de la page de A devient un lead de A — jamais de B —, lu avec le jeton déchiffré de CETTE page", async () => {
    lireProspect.mockResolvedValue({ ok: true, donnees: prospect() });
    const id = nouvelId();
    const issue = await traiterProspectFacebook({ pageId: PAGE_A, leadgenId: id });

    expect(issue.statut).toBe("cree");
    expect(lireProspect).toHaveBeenCalledWith(id, "jeton-page-a");
    const chezA = await leadsDe(idA);
    expect(chezA.some((l) => l.referenceExterne === `facebook-${id}` && l.sourceExterne === "Facebook Ads" && l.nom === "Awa Ndiaye" && l.assigneAId === adminA)).toBe(true);
    expect(await leadsDe(idB)).toHaveLength(0);
    const [connexion] = await avecEntreprise(idA, (tx) => tx.select().from(connexionFacebook).where(eq(connexionFacebook.pageId, PAGE_A)));
    expect(connexion.dernierLeadLe).not.toBeNull();
  }, 90_000);

  test("le même prospect renvoyé par Meta ne crée jamais un deuxième lead", async () => {
    lireProspect.mockResolvedValue({ ok: true, donnees: prospect("Doublon Test") });
    const id = nouvelId();
    expect((await traiterProspectFacebook({ pageId: PAGE_A, leadgenId: id })).statut).toBe("cree");
    expect((await traiterProspectFacebook({ pageId: PAGE_A, leadgenId: id })).statut).toBe("doublon");
    expect((await leadsDe(idA)).filter((l) => l.referenceExterne === `facebook-${id}`)).toHaveLength(1);
  }, 90_000);

  test("une page inconnue, un espace suspendu ou un jeton illisible sont ignorés sans rien créer", async () => {
    lireProspect.mockResolvedValue({ ok: true, donnees: prospect("Ignoré") });
    const avant = (await leadsDe(idA)).length;
    expect(await traiterProspectFacebook({ pageId: "99999999999", leadgenId: nouvelId() })).toEqual({ statut: "ignore", raison: "PAGE_INCONNUE" });
    expect(lireProspect).not.toHaveBeenCalled();

    await db.update(entreprise).set({ statutAbonnement: "suspendu" }).where(eq(entreprise.id, idA));
    expect(await traiterProspectFacebook({ pageId: PAGE_A, leadgenId: nouvelId() })).toEqual({ statut: "ignore", raison: "ABONNEMENT_SUSPENDU" });
    await db.update(entreprise).set({ statutAbonnement: "actif" }).where(eq(entreprise.id, idA));

    await avecEntreprise(idA, (tx) => tx.update(connexionFacebook).set({ jetonChiffre: "v1.corrompu" }).where(eq(connexionFacebook.pageId, PAGE_A)));
    expect(await traiterProspectFacebook({ pageId: PAGE_A, leadgenId: nouvelId() })).toEqual({ statut: "ignore", raison: "JETON_ILLISIBLE" });
    await avecEntreprise(idA, (tx) => tx.update(connexionFacebook).set({ jetonChiffre: chiffrer("jeton-page-a", CONTEXTE_JETON_PAGE) }).where(eq(connexionFacebook.pageId, PAGE_A)));
    expect((await leadsDe(idA)).length).toBe(avant);
  }, 90_000);

  test("Facebook injoignable : rien n'est créé, l'événement est simplement ignoré", async () => {
    lireProspect.mockResolvedValue({ ok: false, erreur: "Facebook injoignable." });
    expect(await traiterProspectFacebook({ pageId: PAGE_A, leadgenId: nouvelId() })).toEqual({ statut: "ignore", raison: "PROSPECT_ILLISIBLE" });
  }, 90_000);

  test("test de fuite : B ne voit ni la connexion, ni le jeton, ni le routage de A, et ne peut pas lui prendre sa page", async () => {
    const connexionsB = await avecEntreprise(idB, (tx) => tx.select().from(connexionFacebook));
    expect(connexionsB.filter((c) => c.pageId === PAGE_A)).toHaveLength(0);
    // B ne peut pas écrire une connexion au nom de A (RLS), ni revendiquer la page déjà reliée à A (index unique mondial).
    await expect(avecEntreprise(idB, (tx) => tx.insert(connexionFacebook).values({ entrepriseId: idA, pageId: "5555555", pageNom: "x", jetonChiffre: "x", connecteParId: adminB }))).rejects.toThrow();
    await expect(avecEntreprise(idB, (tx) => tx.insert(routageFacebookPage).values({ entrepriseId: idB, pageId: PAGE_A }))).rejects.toThrow();
    const [route] = await db.select().from(routageFacebookPage).where(eq(routageFacebookPage.pageId, PAGE_A));
    expect(route.entrepriseId).toBe(idA);
  }, 90_000);

  test("webhook : signature absente ou fausse → 403 ; signée → 200 et lead créé après la réponse, avec alerte à l'administrateur", async () => {
    lireProspect.mockResolvedValue({ ok: true, donnees: prospect("Via Webhook") });
    const id = nouvelId();
    const corps = charge(PAGE_A, id);

    expect((await POST(requeteSignee(corps, false))).status).toBe(403);
    expect((await POST(new Request("https://vertexone.test/api/facebook/webhook", { method: "POST", body: corps, headers: { "x-hub-signature-256": "sha256=abcd" } }))).status).toBe(403);
    expect(lireProspect).not.toHaveBeenCalled();

    const reponse = await POST(requeteSignee(corps));
    expect(reponse.status).toBe(200);
    await vi.waitFor(async () => expect((await leadsDe(idA)).some((l) => l.referenceExterne === `facebook-${id}`)).toBe(true), { timeout: 20_000 });
    await vi.waitFor(() => expect(envoyerEmail).toHaveBeenCalled(), { timeout: 20_000 });
    expect(envoyerEmail.mock.calls[0][0].html).toContain("Facebook Ads");
  }, 90_000);

  test("webhook : un JSON cassé ou une page inconnue répondent 200 sans rien créer", async () => {
    expect((await POST(requeteSignee("pas du json"))).status).toBe(200);
    const avant = (await leadsDe(idA)).length;
    expect((await POST(requeteSignee(charge("12345678", nouvelId())))).status).toBe(200);
    expect(lireProspect).not.toHaveBeenCalled();
    expect((await leadsDe(idA)).length).toBe(avant);
  }, 90_000);

  test("GET : la vérification de Meta exige le bon jeton", async () => {
    const url = (jeton: string) => new Request(`https://vertexone.test/api/facebook/webhook?hub.mode=subscribe&hub.verify_token=${jeton}&hub.challenge=abc123`);
    const bon = await GET(url("jeton-de-verification-test"));
    expect(bon.status).toBe(200);
    expect(await bon.text()).toBe("abc123");
    expect((await GET(url("mauvais"))).status).toBe(403);
  });
});

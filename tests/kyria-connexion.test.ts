import { createHmac } from "node:crypto";
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, cleApiEntreprise } from "@/db/schema";
import { empreinteCle, genererCle } from "@/lib/api-externe/cle";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

const { autoriserKyria } = await import("@/lib/actions/kyria");
const { retourAutorise, signerCorps, transmettreCleAKyria, NOM_CLE_KYRIA } = await import("@/lib/kyria/connexion");

const PORTAIL = "https://portail-kyria.exemple.test";
const ETAT = "A".repeat(43);
const SECRET = "secret-partage-de-test";
const RETOUR = `${PORTAIL}/portail/vertexone/retour`;

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Kyria A ${suffixe}`;
const nomB = `TEST Kyria B ${suffixe}`;
let idA = "", idB = "", adminA = "", managerA = "", adminB = "";

const clesDe = (entrepriseId: string) => avecEntreprise(entrepriseId, (tx) => tx.select().from(cleApiEntreprise).where(eq(cleApiEntreprise.entrepriseId, entrepriseId)));
const actives = async (entrepriseId: string) => (await clesDe(entrepriseId)).filter((c) => c.nom === NOM_CLE_KYRIA && !c.revoqueeLe);
const formulaire = (valeurs: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(valeurs)) f.set(k, v);
  return f;
};
async function redirection(promesse: Promise<void>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    const m = /^REDIRECT (.+)$/.exec((e as Error).message);
    if (m) return m[1];
    throw e;
  }
  throw new Error("aucune redirection");
}

beforeAll(async () => {
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
}, 180_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 180_000);

beforeEach(() => {
  vi.stubEnv("KYRIA_PORTAIL_URL", PORTAIL);
  vi.stubEnv("KYRIA_CONNEXION_URL", `${PORTAIL}/api/vertexone/connexion`);
  vi.stubEnv("KYRIA_CONNEXION_SECRET", SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Connexion de Kyria — adresse de retour", () => {
  test("n'accepte que le portail Kyria déclaré", () => {
    expect(retourAutorise(RETOUR)).toBe(RETOUR);
    expect(retourAutorise(`${PORTAIL}/autre/page?x=1`)).toContain(`${PORTAIL}/autre/page`);
    expect(retourAutorise("https://pirate.exemple.test/retour")).toBeNull();
    expect(retourAutorise("https://portail-kyria.exemple.test.pirate.com/retour")).toBeNull(); // sous-domaine déguisé
    expect(retourAutorise("http://portail-kyria.exemple.test/retour")).toBeNull(); // pas de http
    expect(retourAutorise("javascript:alert(1)")).toBeNull();
    expect(retourAutorise("")).toBeNull();
    expect(retourAutorise("//pirate.exemple.test")).toBeNull();
  });

  test("sans KYRIA_PORTAIL_URL, aucune adresse n'est acceptée", () => {
    vi.stubEnv("KYRIA_PORTAIL_URL", "");
    expect(retourAutorise(RETOUR)).toBeNull();
  });
});

describe("Connexion de Kyria — transmission de la clé", () => {
  test("envoie la clé au serveur de Kyria avec une signature que Kyria peut vérifier", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    expect(await transmettreCleAKyria({ etat: ETAT, cle: "vo_cle", entreprise: "Global Mobility" })).toEqual({ ok: true });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${PORTAIL}/api/vertexone/connexion`);
    const attendue = createHmac("sha256", SECRET).update(options.body).digest("hex");
    expect(options.headers["X-Vertexone-Signature"]).toBe(`sha256=${attendue}`);
    expect(signerCorps(options.body, SECRET)).toBe(attendue);
    expect(JSON.parse(options.body)).toMatchObject({ etat: ETAT, cle: "vo_cle", entreprise: "Global Mobility" });
  });

  test("refuse d'envoyer la clé par une adresse non sécurisée, ou sans secret", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("KYRIA_CONNEXION_URL", "http://portail-kyria.exemple.test/api/vertexone/connexion");
    expect((await transmettreCleAKyria({ etat: ETAT, cle: "vo_cle", entreprise: "X" })).ok).toBe(false);
    vi.stubEnv("KYRIA_CONNEXION_URL", `${PORTAIL}/api/vertexone/connexion`);
    vi.stubEnv("KYRIA_CONNEXION_SECRET", "");
    expect((await transmettreCleAKyria({ etat: ETAT, cle: "vo_cle", entreprise: "X" })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("une erreur de Kyria ne laisse jamais fuiter la clé", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("échec avec vo_cle-secrete")));
    const r = await transmettreCleAKyria({ etat: ETAT, cle: "vo_cle-secrete", entreprise: "X" });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("vo_cle-secrete");
  });
});

describe("Connexion de Kyria — autorisation par l'Administrateur", () => {
  test("crée une clé dédiée sans droit de facturer, la transmet, et renvoie vers le portail", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const url = await redirection(autoriserKyria(formulaire({ etat: ETAT, retour: RETOUR })));

    expect(url).toBe(`${RETOUR}?statut=ok`);
    const cles = await actives(idA);
    expect(cles).toHaveLength(1);
    expect(cles[0].autoriseFacturation).toBe(false);
    const corps = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(corps).toMatchObject({ etat: ETAT, entreprise: nomA });
    expect(corps.cle).toMatch(/^vo_[A-Za-z0-9_-]{43}$/);
    expect(empreinteCle(corps.cle)).toBe(cles[0].empreinte); // la clé transmise est bien celle qui est enregistrée
  }, 240_000);

  test("une nouvelle connexion remplace l'ancienne clé : une seule reste active", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    const avant = (await actives(idA))[0];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    expect(await redirection(autoriserKyria(formulaire({ etat: ETAT, retour: RETOUR })))).toBe(`${RETOUR}?statut=ok`);

    const apres = await actives(idA);
    expect(apres).toHaveLength(1);
    expect(apres[0].id).not.toBe(avant.id);
    const ancienne = (await clesDe(idA)).find((c) => c.id === avant.id)!;
    expect(ancienne.revoqueeLe).not.toBeNull();
  }, 240_000);

  test("si Kyria ne reçoit pas la clé, la clé créée est révoquée aussitôt et l'ancienne reste utilisable", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    const avant = (await actives(idA))[0];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    expect(await redirection(autoriserKyria(formulaire({ etat: ETAT, retour: RETOUR })))).toBe(`${RETOUR}?statut=echec`);

    const apres = await actives(idA);
    expect(apres.map((c) => c.id)).toEqual([avant.id]); // aucune clé orpheline, l'ancienne connexion n'est pas coupée
  }, 240_000);

  test("un Manager ne peut pas connecter Kyria, rien n'est créé ni transmis", async () => {
    connecte = { utilisateurId: managerA, entrepriseId: idA, role: "MANAGER" };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const avant = (await clesDe(idA)).length;

    expect(await redirection(autoriserKyria(formulaire({ etat: ETAT, retour: RETOUR })))).toBe(`${RETOUR}?statut=droits`);

    expect((await clesDe(idA)).length).toBe(avant);
    expect(fetchMock).not.toHaveBeenCalled();
  }, 240_000);

  test("une adresse de retour étrangère ou un état invalide sont refusés avant tout", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const avant = (await clesDe(idA)).length;

    expect(await redirection(autoriserKyria(formulaire({ etat: ETAT, retour: "https://pirate.exemple.test/retour" })))).toBe("/app/parametres/integrations/kyria?erreur=invalide");
    expect(await redirection(autoriserKyria(formulaire({ etat: "trop-court", retour: RETOUR })))).toBe("/app/parametres/integrations/kyria?erreur=invalide");

    expect((await clesDe(idA)).length).toBe(avant);
    expect(fetchMock).not.toHaveBeenCalled();
  }, 240_000);

  test("sans session : redirection vers la connexion ; l'autre entreprise n'est jamais touchée", async () => {
    connecte = null;
    expect(await redirection(autoriserKyria(formulaire({ etat: ETAT, retour: RETOUR })))).toBe("/connexion");

    const { empreinte, prefixe } = genererCle();
    await avecEntreprise(idB, (tx) => tx.insert(cleApiEntreprise).values({ entrepriseId: idB, nom: NOM_CLE_KYRIA, prefixe, empreinte, creeParId: adminB }));
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    await redirection(autoriserKyria(formulaire({ etat: ETAT, retour: RETOUR })));

    const clesB = await avecEntreprise(idB, (tx) => tx.select().from(cleApiEntreprise).where(and(eq(cleApiEntreprise.entrepriseId, idB), isNull(cleApiEntreprise.revoqueeLe))));
    expect(clesB).toHaveLength(1); // la clé de B reste active : A n'a révoqué que les siennes
  }, 240_000);
});

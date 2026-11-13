import { describe, test, expect, beforeAll } from "vitest";
import { chiffrerConfig, dechiffrerConfig } from "@/lib/boutique/chiffrement";
import { creerAppeleur, estAdressePrivee, normaliserAdresse, verifierHotePublic } from "@/lib/boutique/adresse-sure";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-assez-long-pour-etre-valide";
});

describe("Chiffrement des identifiants du site", () => {
  test("aller-retour exact, jamais en clair, chaque chiffrement est différent", () => {
    const config = { adresse: "https://maboutique.com", cle: "ck_abcdef123456", secret: "cs_secret_très_privé" };
    const a = chiffrerConfig(config);
    const b = chiffrerConfig(config);
    expect(a).not.toBe(b);
    expect(a).not.toContain("ck_abcdef123456");
    expect(a).not.toContain("cs_secret");
    expect(dechiffrerConfig(a)).toEqual(config);
  });

  test("un texte altéré, tronqué ou vide est refusé sans exception", () => {
    const a = chiffrerConfig({ cle: "x" });
    const [v, iv, tag, donnees] = a.split(".");
    expect(dechiffrerConfig(`${v}.${iv}.${tag}.${donnees.slice(0, -2)}AA`)).toBeNull();
    expect(dechiffrerConfig(`${v}.${iv}.${tag}`)).toBeNull();
    expect(dechiffrerConfig("n'importe quoi")).toBeNull();
    expect(dechiffrerConfig(null)).toBeNull();
  });

  test("avec un autre secret d'application, les identifiants sont illisibles (à reconnecter)", () => {
    const a = chiffrerConfig({ cle: "x" });
    const ancien = process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_SECRET = "un-tout-autre-secret-de-test-assez-long";
    expect(dechiffrerConfig(a)).toBeNull();
    process.env.BETTER_AUTH_SECRET = ancien;
    expect(dechiffrerConfig(a)).toEqual({ cle: "x" });
  });
});

describe("Garde contre les adresses internes (SSRF)", () => {
  test.each([
    ["127.0.0.1", true], ["10.0.0.5", true], ["172.16.4.4", true], ["172.31.255.255", true], ["192.168.1.10", true], ["169.254.169.254", true],
    ["100.64.0.1", true], ["0.0.0.0", true], ["224.0.0.1", true], ["::1", true], ["fd00::1", true], ["fe80::1", true], ["::ffff:127.0.0.1", true], ["::ffff:10.1.2.3", true],
    ["8.8.8.8", false], ["172.32.0.1", false], ["172.15.0.1", false], ["41.202.12.9", false], ["2606:4700:4700::1111", false],
  ])("%s → privée : %s", (ip, attendu) => {
    expect(estAdressePrivee(ip)).toBe(attendu);
  });

  test("l'adresse collée est normalisée ; http, port, identifiants et adresses numériques sont refusés", () => {
    expect(normaliserAdresse("maboutique.com")).toEqual({ ok: true, adresse: { origine: "https://maboutique.com", base: "https://maboutique.com" } });
    expect(normaliserAdresse("  https://www.maboutique.com/  ")).toMatchObject({ ok: true, adresse: { base: "https://www.maboutique.com" } });
    expect(normaliserAdresse("https://maboutique.com/boutique/")).toMatchObject({ ok: true, adresse: { origine: "https://maboutique.com", base: "https://maboutique.com/boutique" } });
    for (const mauvaise of ["http://maboutique.com", "https://maboutique.com:8443", "https://user:mdp@maboutique.com", "https://127.0.0.1", "https://[::1]/", "https://localhost", "", "pas une adresse"]) {
      expect(normaliserAdresse(mauvaise).ok, mauvaise).toBe(false);
    }
  });

  test("un nom qui pointe vers une adresse interne (même parmi d'autres) est refusé", async () => {
    const adresse = { origine: "https://piege.exemple.com", base: "https://piege.exemple.com" };
    expect((await verifierHotePublic(adresse, async () => ["8.8.8.8"])).ok).toBe(true);
    expect((await verifierHotePublic(adresse, async () => ["8.8.8.8", "169.254.169.254"])).ok).toBe(false);
    expect((await verifierHotePublic(adresse, async () => ["10.0.0.1"])).ok).toBe(false);
    expect((await verifierHotePublic(adresse, async () => [])).ok).toBe(false);
    expect((await verifierHotePublic(adresse, async () => { throw new Error("NXDOMAIN"); })).ok).toBe(false);
  });

  test("l'appeleur ne joint jamais une adresse interne, ne suit aucune redirection et reste dans le site", async () => {
    const adresse = { origine: "https://maboutique.com", base: "https://maboutique.com" };
    let appels = 0;
    const faux = (async (url: string) => { appels++; return new Response(url.includes("redirige") ? "" : "{}", { status: url.includes("redirige") ? 302 : 200, headers: url.includes("redirige") ? { location: "http://169.254.169.254/" } : {} }); }) as unknown as typeof fetch;

    const interne = creerAppeleur(adresse, { resolveur: async () => ["10.0.0.9"], fetchImpl: faux });
    await expect(interne("https://maboutique.com/x")).rejects.toThrow(/pas autorisée/);
    expect(appels).toBe(0); // rien n'est envoyé

    const publique = creerAppeleur(adresse, { resolveur: async () => ["41.202.12.9"], fetchImpl: faux });
    expect((await publique("https://maboutique.com/x")).statut).toBe(200);
    await expect(publique("https://maboutique.com/redirige")).rejects.toThrow(/redirige/);
    await expect(publique("https://autre-site.com/x")).rejects.toThrow(/hors du site/i);
    await expect(publique("https://maboutique.com.pirate.net/x")).rejects.toThrow(); // préfixe de nom qui ressemble : hors du site
  });
});

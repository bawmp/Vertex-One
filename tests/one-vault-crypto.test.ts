import { describe, test, expect, afterEach, vi } from "vitest";
import { randomBytes } from "crypto";

/**
 * src/lib/vault/crypto.ts lit VAULT_ENCRYPTION_KEY au chargement du module
 * (variable au niveau module, comme kyria/client.ts) — pour tester
 * plusieurs clés dans le même run, on réimporte le module dynamiquement
 * après avoir changé process.env.VAULT_ENCRYPTION_KEY et vidé le cache de
 * résolution Vitest (vi.resetModules()), plutôt que d'importer une seule
 * fois en haut du fichier.
 */
async function chargerModule() {
  vi.resetModules();
  return import("@/lib/vault/crypto");
}

const CLE_VALIDE = randomBytes(32).toString("base64");
const CLE_ORIGINALE = process.env.VAULT_ENCRYPTION_KEY;

describe("One Vault — chiffrement", () => {
  afterEach(() => {
    process.env.VAULT_ENCRYPTION_KEY = CLE_ORIGINALE;
  });

  test("vaultConfigure() est faux sans clé, faux avec une clé de mauvaise taille, vrai avec une clé valide", async () => {
    delete process.env.VAULT_ENCRYPTION_KEY;
    expect((await chargerModule()).vaultConfigure()).toBe(false);

    process.env.VAULT_ENCRYPTION_KEY = Buffer.from("trop-courte").toString("base64");
    expect((await chargerModule()).vaultConfigure()).toBe(false);

    process.env.VAULT_ENCRYPTION_KEY = CLE_VALIDE;
    expect((await chargerModule()).vaultConfigure()).toBe(true);
  });

  test("chiffrer() puis déchiffrer() redonne le texte d'origine, avec un blob différent à chaque appel (IV aléatoire)", async () => {
    process.env.VAULT_ENCRYPTION_KEY = CLE_VALIDE;
    const { chiffrer, dechiffrer } = await chargerModule();

    const texte = "mot de passe très secret !";
    const blobA = chiffrer(texte);
    const blobB = chiffrer(texte);

    expect(blobA).not.toBe(blobB);
    expect(dechiffrer(blobA)).toBe(texte);
    expect(dechiffrer(blobB)).toBe(texte);
  });

  test("déchiffrer() échoue fort si la clé a changé entre le chiffrement et le déchiffrement", async () => {
    process.env.VAULT_ENCRYPTION_KEY = CLE_VALIDE;
    const { chiffrer } = await chargerModule();
    const blob = chiffrer("donnée sensible");

    process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const { dechiffrer } = await chargerModule();

    expect(() => dechiffrer(blob)).toThrow();
  });

  test("chiffrer() lève une exception si la clé n'est pas configurée — jamais de stockage en clair silencieux", async () => {
    delete process.env.VAULT_ENCRYPTION_KEY;
    const { chiffrer } = await chargerModule();
    expect(() => chiffrer("donnée sensible")).toThrow();
  });

  test("chiffrerContenuSecret()/dechiffrerContenuSecret() conservent motDePasse et notes ensemble", async () => {
    process.env.VAULT_ENCRYPTION_KEY = CLE_VALIDE;
    const { chiffrerContenuSecret, dechiffrerContenuSecret } = await chargerModule();

    const contenu = { motDePasse: "S3cr3t!", notes: "Compte créé le 2026-09-17, renouveler avant décembre." };
    const blob = chiffrerContenuSecret(contenu);
    expect(dechiffrerContenuSecret(blob)).toEqual(contenu);
  });
});

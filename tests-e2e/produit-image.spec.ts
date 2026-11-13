import { test, expect } from "@playwright/test";
import { deflateSync, crc32 } from "node:zlib";
import { MOT_DE_PASSE, supprimerEntrepriseDeTest } from "./aide-equipe";

// Image d'un produit (2026-11-13), contre le vrai stockage de développement : création avec une grosse photo (réduite toute seule par le
// navigateur), remplacement, fichier qui n'est pas une image, suppression. L'image est supprimée à la fin : rien ne reste dans R2.
const CAPTURES = process.env.CAPTURES ?? "test-results";
let nomEntreprise = "";

test.afterAll(async () => {
  if (nomEntreprise) await supprimerEntrepriseDeTest(nomEntreprise);
});

/** PNG RVB « photo » : un dégradé avec un léger grain, assez lourd (> 1 Mo) pour déclencher la réduction, mais comme une vraie photo. */
function png(largeur: number, hauteur: number): Buffer {
  const brut = Buffer.alloc((largeur * 3 + 1) * hauteur);
  let graine = 12345;
  const alea = () => ((graine = (graine * 1103515245 + 12345) & 0x7fffffff) % 24);
  for (let y = 0; y < hauteur; y++) {
    const debut = y * (largeur * 3 + 1);
    brut[debut] = 0;
    for (let x = 0; x < largeur; x++) {
      const i = debut + 1 + x * 3;
      brut[i] = (x * 255) / largeur + alea();
      brut[i + 1] = (y * 255) / hauteur + alea();
      brut[i + 2] = 128 + alea();
    }
  }
  const bloc = (type: string, donnees: Buffer) => {
    const t = Buffer.concat([Buffer.from(type), donnees]);
    const longueur = Buffer.alloc(4);
    longueur.writeUInt32BE(donnees.length);
    const somme = Buffer.alloc(4);
    somme.writeUInt32BE(crc32(t));
    return Buffer.concat([longueur, t, somme]);
  };
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  entete[8] = 8; // 8 bits
  entete[9] = 2; // RVB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloc("IHDR", entete), bloc("IDAT", deflateSync(brut, { level: 1 })), bloc("IEND", Buffer.alloc(0))]);
}

test("ajouter, remplacer et supprimer l'image d'un produit", async ({ page }) => {
  test.setTimeout(400_000);
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  nomEntreprise = `TEST produitimage ${suffixe}`;
  const nomProduit = `Vélo ${suffixe}`;

  await page.goto("/inscription");
  await page.fill("#nomEntreprise", nomEntreprise);
  await page.getByRole("radio", { name: "Agence" }).click();
  await page.fill("#nomComplet", "Alice Admin");
  await page.fill("#email", `produitimage-${suffixe}@vertexone.test`);
  await page.fill("#motDePasse", MOT_DE_PASSE);
  await page.click('button[type="submit"]');
  await page.waitForURL("/app", { timeout: 90_000 });

  // 1. Création avec une grosse photo : aperçu, réduction automatique, miniature dans la liste.
  await page.goto("/app/produits");
  await page.getByRole("button", { name: "Nouveau produit" }).click();
  await page.fill("#nom", nomProduit);
  const grosse = png(2000, 2000);
  expect(grosse.length).toBeGreaterThan(1_000_000);
  await page.locator("#image-nouveau").setInputFiles({ name: "photo du velo.png", mimeType: "image/png", buffer: grosse });
  await expect(page.getByText(/Photo réduite automatiquement/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("img", { name: "Aperçu de l'image" })).toBeVisible();
  await page.locator("form").filter({ has: page.locator("#image-nouveau") }).screenshot({ path: `${CAPTURES}/produit-image-creation.png` });
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await page.waitForURL("/app/produits", { timeout: 90_000 });
  const miniature = page.locator(`a:has-text("${nomProduit}") img`).first();
  await expect(miniature).toBeVisible({ timeout: 60_000 });

  // 2. L'image stockée est bien un JPEG réduit (le PNG de départ faisait plusieurs Mo), servie par la route protégée.
  const src = (await miniature.getAttribute("src"))!;
  expect(src).toMatch(/^\/app\/produits\/[^/]+\/image$/);
  const r = await page.request.get(src);
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toMatch(/image\/jpeg/);
  expect((await r.body()).length).toBeLessThan(4 * 1024 * 1024);
  expect((await page.request.get(src.replace(/\/produits\/[^/]+\//, "/produits/inexistant/"))).status()).not.toBe(200);

  // 3. Fiche : un fichier qui n'est pas une image est refusé avec un message clair, l'image actuelle reste.
  await page.getByRole("link", { name: new RegExp(nomProduit) }).first().click();
  await expect(page.getByRole("button", { name: "Remplacer l'image" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("button", { name: "Supprimer l'image" })).toBeVisible();
  await page.locator("#image").setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<html><script>alert(1)</script></html>") });
  await page.getByRole("button", { name: "Remplacer l'image" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "n'est pas une image" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('img[src$="/image"]').first()).toBeVisible(); // l'image actuelle est toujours là

  // 4. Remplacement par une petite image valide : confirmation, champ remis à zéro.
  await page.locator("#image").setInputFiles({ name: "petite.png", mimeType: "image/png", buffer: png(40, 40) });
  await page.getByRole("button", { name: "Remplacer l'image" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Image enregistrée." })).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${CAPTURES}/produit-image-fiche.png`, fullPage: true });

  // 5. Mobile : le champ reste utilisable, sans débordement horizontal.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("button", { name: "Remplacer l'image" })).toBeVisible({ timeout: 90_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.screenshot({ path: `${CAPTURES}/produit-image-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });

  // 6. Suppression : l'image disparaît (et l'objet de R2 aussi), le bouton redevient « Téléverser ».
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Supprimer l'image" }).click();
  await expect(page.getByRole("button", { name: "Téléverser" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('img[src$="/image"]')).toHaveCount(0);
  await page.goto("/app/produits");
  await expect(page.locator(`a:has-text("${nomProduit}") img`)).toHaveCount(0, { timeout: 60_000 });
});

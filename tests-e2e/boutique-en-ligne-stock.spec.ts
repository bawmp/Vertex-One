import { test, expect } from "@playwright/test";
import { MOT_DE_PASSE, supprimerEntrepriseDeTest } from "./aide-equipe";

// Boutique en ligne connectée (2026-11-12) : l'Administrateur connecte son site en un clic, le site appelle l'API avec la clé obtenue,
// et l'écran Paramètres → Intégrations montre la commande reçue ainsi que le code que Vertex One ne reconnaît pas.
const CAPTURES = process.env.CAPTURES ?? "test-results";
let nomEntreprise = "";

test.afterAll(async () => {
  if (nomEntreprise) await supprimerEntrepriseDeTest(nomEntreprise);
});

test("connecter une boutique, recevoir une commande, voir le code inconnu", async ({ page, request }) => {
  test.setTimeout(300_000);
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  nomEntreprise = `TEST boutique ${suffixe}`;

  await page.goto("/inscription");
  await page.fill("#nomEntreprise", nomEntreprise);
  await page.getByRole("radio", { name: "Agence" }).click();
  await page.fill("#nomComplet", "Alice Admin");
  await page.fill("#email", `boutique-${suffixe}@vertexone.test`);
  await page.fill("#motDePasse", MOT_DE_PASSE);
  await page.click('button[type="submit"]');
  await page.waitForURL("/app", { timeout: 90_000 });

  await page.goto("/app/parametres/integrations");
  await expect(page.getByRole("heading", { name: "Boutique en ligne : un seul stock" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Aucun produit n'a encore son stock suivi.")).toBeVisible();

  // Première visite : le guide WooCommerce est déjà ouvert (le cas le plus courant), pas à pas, sans mot technique.
  await expect(page.getByText("Ouvrez WooCommerce → Réglages → Avancé → API REST")).toBeVisible();
  await expect(page.getByRole("button", { name: "Vérifier ma boutique" })).toBeVisible();
  await page.getByRole("button", { name: "Vérifier ma boutique" }).click(); // champs vides : refusés par le navigateur, rien n'est envoyé
  await expect(page.locator("#woo-adresse:invalid")).toHaveCount(1);
  await page.locator("div").filter({ has: page.getByRole("heading", { name: "Boutique en ligne : un seul stock" }) }).last().screenshot({ path: `${CAPTURES}/boutique-woocommerce.png` });

  // Échange de fichiers : le stock se télécharge, les commandes s'importent avec le bon type déjà choisi.
  await page.getByRole("button", { name: /Autre site ou tableur/ }).click();
  const telechargement = page.waitForEvent("download");
  await page.getByRole("button", { name: "Télécharger mon stock" }).click();
  expect((await telechargement).suggestedFilename()).toMatch(/^vertexone-stock-pour-mon-site-\d{4}-\d{2}-\d{2}\.csv$/);
  await page.getByRole("link", { name: "Importer les commandes" }).click();
  await expect(page).toHaveURL(/\/app\/parametres\/import\?type=COMMANDES_SITE/, { timeout: 90_000 }); // première compilation de la page d'import à froid
  await expect(page.getByText("Commandes de votre site").first()).toBeVisible({ timeout: 90_000 });
  await page.goto("/app/parametres/integrations");
  await expect(page.getByRole("heading", { name: "Boutique en ligne : un seul stock" })).toBeVisible({ timeout: 90_000 });

  // Mon développeur s'en occupe : une clé, un « pack » à transmettre.
  await page.getByRole("button", { name: /Mon développeur s'en occupe/ }).click();
  await page.fill("#nom-boutique", "Ma boutique de test");
  await page.getByRole("button", { name: "Connecter", exact: true }).click();
  const cle = (await page.locator("code", { hasText: /^vo_/ }).first().innerText()).trim();
  expect(cle).toMatch(/^vo_[A-Za-z0-9_-]{43}$/);
  await expect(page.getByText("est connecté. Copiez cette clé maintenant")).toBeVisible();

  // Le site appelle l'API avec cette clé : la lecture marche, une commande est enregistrée, son code est inconnu.
  const entetes = { Authorization: `Bearer ${cle}` };
  const lecture = await request.get("/api/externe/stock", { headers: entetes });
  expect(lecture.status()).toBe(200);
  const commande = await request.post("/api/externe/stock/commandes", { headers: entetes, data: { reference: `cmd-${suffixe}`, lignes: [{ code: `INCONNU-${suffixe}`, quantite: 2 }] } });
  expect(commande.status()).toBe(201);
  expect(((await commande.json()) as { aVerifier: string[] }).aVerifier).toEqual([`INCONNU-${suffixe}`]);

  await page.reload();
  await expect(page.getByText("Votre site a vendu des articles que Vertex One ne reconnaît pas")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(`INCONNU-${suffixe}`)).toBeVisible();
  await expect(page.getByText(`cmd-${suffixe}`)).toBeVisible();
  await expect(page.getByText("1 à vérifier")).toBeVisible();
  await expect(page.getByText("1 commande(s) reçue(s) en 30 jours")).toBeVisible();

  const carte = page.locator("div").filter({ has: page.getByRole("heading", { name: "Boutique en ligne : un seul stock" }) }).last();
  await carte.screenshot({ path: `${CAPTURES}/boutique-bureau.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Boutique en ligne : un seul stock" })).toBeVisible({ timeout: 90_000 });
  const debordement = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(debordement).toBe(false);
  await page.screenshot({ path: `${CAPTURES}/boutique-mobile.png`, fullPage: true });

  // Déconnecter : la clé ne marche plus (401).
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Déconnecter" }).first().click();
  await expect.poll(async () => (await request.get("/api/externe/stock", { headers: entetes })).status(), { timeout: 60_000 }).toBe(401);
});

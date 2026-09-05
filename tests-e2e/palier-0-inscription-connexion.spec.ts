import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { entreprise, utilisateur, compte, session } from "../src/db/schema";

// Parcours critique Palier 0, section 9 étapes 2-3 : inscription d'une
// nouvelle entreprise, session établie, tableau de bord affiche le bon rôle
// et le bon menu (peut()/portee()) — vérifié dans un vrai navigateur, pas
// seulement par lecture de code, conformément à la stack (Playwright pour
// les parcours critiques).
const email = `e2e-${Date.now()}@vertexone.test`;
const motDePasse = "mot-de-passe-test-12345";

test.afterAll(async () => {
  const [u] = await db.select().from(utilisateur).where(eq(utilisateur.email, email));
  if (u) {
    await db.delete(session).where(eq(session.userId, u.id));
    await db.delete(compte).where(eq(compte.userId, u.id));
    await db.delete(utilisateur).where(eq(utilisateur.id, u.id));
    await db.delete(entreprise).where(eq(entreprise.id, u.entrepriseId));
  }
});

test("inscription crée l'entreprise, connecte l'Administrateur, et affiche le menu complet", async ({ page }) => {
  await page.goto("/inscription");

  await page.fill("#nomEntreprise", "TEST E2E Agence Kiro");
  await page.selectOption("#secteurProfil", "agence");
  await page.fill("#nomComplet", "Admin E2E");
  await page.fill("#email", email);
  await page.fill("#motDePasse", motDePasse);
  await page.click('button[type="submit"]');

  await page.waitForURL("/app");
  await expect(page.locator("nav").getByText("ADMIN")).toBeVisible();

  // ADMIN a VOIR sur tous les modules (matrice, src/lib/permissions.ts) —
  // les cinq entrées du menu doivent être visibles.
  for (const libelle of ["CRM", "Facturation", "Projets", "Documents", "Paramètres"]) {
    await expect(page.getByRole("link", { name: libelle })).toBeVisible();
  }
});

test("connexion avec les identifiants créés ramène au tableau de bord", async ({ page }) => {
  await page.goto("/connexion");

  await page.fill("#email", email);
  await page.fill("#motDePasse", motDePasse);
  await page.click('button[type="submit"]');

  await page.waitForURL("/app");
  await expect(page.locator("nav").getByText("ADMIN")).toBeVisible();
});

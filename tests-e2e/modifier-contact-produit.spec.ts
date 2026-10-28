import { test, expect } from "@playwright/test";
import { MOT_DE_PASSE } from "./aide-equipe";
import { supprimerEntrepriseDeTest } from "../tests/aide-nettoyage";

// Modifier un contact enregistré (fiche → Modifier) et un produit/service du catalogue (liste ou fiche → Modifier).
const ATTENTE = { timeout: 60_000 };
let nomEntreprise = "";

test.afterAll(async () => {
  if (nomEntreprise) await supprimerEntrepriseDeTest(nomEntreprise);
});

test("Modifier un contact et un produit déjà créés", async ({ page }) => {
  test.setTimeout(400_000);
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  nomEntreprise = `TEST modif ${suffixe}`;
  await page.goto("/inscription");
  await page.fill("#nomEntreprise", nomEntreprise);
  await page.getByRole("radio", { name: "Agence" }).click();
  await page.fill("#nomComplet", "Alice Admin");
  await page.fill("#email", `modif-admin-${suffixe}@vertexone.test`);
  await page.fill("#motDePasse", MOT_DE_PASSE);
  await page.click('button[type="submit"]');
  await page.waitForURL("/app", { timeout: 120_000 });

  // ===== Contact : création, puis modification depuis la fiche =====
  await page.goto("/app/contacts/nouveau");
  await page.fill("#nom", "Jean Mbarga");
  await page.fill("#telephone", "690111222");
  await page.getByRole("button", { name: "Créer le contact" }).click();
  await page.waitForURL(/\/app\/contacts\/[^/]+$/, { timeout: 120_000 });
  await expect(page.getByRole("heading", { name: "Jean Mbarga" })).toBeVisible(ATTENTE);

  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  await page.waitForURL(/\/modifier$/, ATTENTE);
  await expect(page.locator("#nom")).toHaveValue("Jean Mbarga"); // formulaire prérempli
  await expect(page.locator("#telephone")).toHaveValue("690111222");
  await page.fill("#nom", "Jean-Pierre Mbarga");
  await page.fill("#fonction", "Directeur achats");
  await page.fill("#telephone", "699000111");
  await page.fill("#email", "jp@exemple.test");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForURL(/\/app\/contacts\/[^/]+$/, { timeout: 120_000 });
  await expect(page.getByRole("heading", { name: "Jean-Pierre Mbarga" })).toBeVisible(ATTENTE);
  await expect(page.getByText("699000111")).toBeVisible(ATTENTE);
  await expect(page.getByText("jp@exemple.test").first()).toBeVisible(ATTENTE); // affiché aussi dans « Envoyer un email »

  // Une valeur invalide est refusée avec un message, sans rien changer.
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  await page.waitForURL(/\/modifier$/, ATTENTE);
  await page.fill("#telephone", "12");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Numéro de téléphone invalide.")).toBeVisible(ATTENTE);

  // ===== Produit : création, puis modification depuis la liste (crayon) =====
  await page.goto("/app/produits");
  await page.getByRole("button", { name: "Nouveau produit" }).click();
  await page.fill("#nom", "Audit de site");
  await page.fill("#prixVente", "50000");
  await page.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByText("Audit de site")).toBeVisible(ATTENTE);

  await page.getByRole("button", { name: "Modifier Audit de site" }).click();
  await page.waitForURL(/\/app\/produits\/[^/?]+\?modifier=1$/, ATTENTE);
  const formulaire = page.getByRole("form", { name: "Modifier le produit" });
  await expect(formulaire.getByLabel("Nom", { exact: true })).toHaveValue("Audit de site");
  await formulaire.getByLabel("Nom", { exact: true }).fill("Audit complet de site");
  await formulaire.getByLabel("Prix de vente (FCFA)").fill("75000");
  await formulaire.getByLabel("Description").fill("Audit technique et SEO");
  await formulaire.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { name: "Audit complet de site" })).toBeVisible(ATTENTE);
  await expect(page.getByText("Audit technique et SEO")).toBeVisible(ATTENTE);

  // Retrouvé dans la liste après modification.
  await page.goto("/app/produits");
  await expect(page.getByText("Audit complet de site")).toBeVisible(ATTENTE);
  await expect(page.getByText("Audit de site", { exact: true })).toHaveCount(0);
});

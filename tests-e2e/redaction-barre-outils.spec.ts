import { test, expect } from "@playwright/test";
import { creerEquipe, type Equipe } from "./aide-equipe";
import { supprimerEntrepriseDeTest } from "../tests/aide-nettoyage";

/**
 * Éditeur de documents : en faisant défiler un long document, la barre de mise en forme (gras, souligné…) reste visible, collée sous la barre du haut,
 * et sert encore. Cause d'origine : `<main>` avait `overflow-x-hidden`, ce qui en fait un conteneur de défilement qui ne défile jamais ; `sticky`
 * s'y accrochait et ne collait donc plus nulle part. Vérifié dans un vrai navigateur avec une vraie base.
 */
let equipe: Equipe | null = null;

test.afterAll(async () => {
  test.setTimeout(120_000);
  if (equipe) {
    await equipe.contexteEmploye.close();
    await supprimerEntrepriseDeTest(equipe.nomEntreprise);
  }
});

test("rédaction : la barre de mise en forme reste collée au défilement et le souligné fonctionne", async ({ page, browser }) => {
  test.setTimeout(300_000);
  equipe = await creerEquipe(page, browser, "redactionbarre");
  const admin = equipe.admin;

  await admin.goto("/app/documents/rediger");
  await admin.fill("#nouveau-titre", "TEST Barre d'outils");
  await admin.getByRole("button", { name: "Créer et rédiger" }).click();
  await admin.waitForURL(/\/app\/documents\/rediger\/[a-z0-9]+$/, { timeout: 90_000 });

  const editeur = admin.locator(".editeur-contenu");
  await expect(editeur).toBeVisible({ timeout: 60_000 });
  await editeur.click();
  for (let i = 1; i <= 60; i++) {
    await admin.keyboard.type(`Ligne ${i} du document long pour faire défiler la page.`);
    await admin.keyboard.press("Enter");
  }
  await admin.keyboard.type("Texte à souligner");

  // Défilement vers le bas : la barre doit rester en vue, juste sous la barre du haut (56 px)
  await admin.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const barre = admin.getByRole("toolbar", { name: "Mise en forme" });
  await expect(barre).toBeInViewport({ ratio: 1 });
  const haut = await barre.evaluate((e) => Math.round(e.getBoundingClientRect().top));
  expect(haut).toBeGreaterThanOrEqual(50);
  expect(haut).toBeLessThanOrEqual(64);

  // …et elle sert encore : on sélectionne la dernière ligne et on la souligne
  await admin.keyboard.press("Shift+Home");
  await barre.getByRole("button", { name: "Souligné" }).click();
  await expect(editeur.locator("u", { hasText: "Texte à souligner" })).toBeVisible();
});

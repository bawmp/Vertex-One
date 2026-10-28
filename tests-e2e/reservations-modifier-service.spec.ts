import { test, expect } from "@playwright/test";
import { MOT_DE_PASSE } from "./aide-equipe";
import { supprimerEntrepriseDeTest } from "../tests/aide-nettoyage";

// Réservations → Services : créer un service, puis le modifier (nom, durée, prix) ; l'annulation ne change rien.
const ATTENTE = { timeout: 60_000 };
let nomEntreprise = "";

test.afterAll(async () => {
  if (nomEntreprise) await supprimerEntrepriseDeTest(nomEntreprise);
});

test("Réservations : modifier un service déjà créé", async ({ page }) => {
  test.setTimeout(300_000);
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  nomEntreprise = `TEST service ${suffixe}`;
  await page.goto("/inscription");
  await page.fill("#nomEntreprise", nomEntreprise);
  await page.getByRole("radio", { name: "Agence" }).click();
  await page.fill("#nomComplet", "Alice Admin");
  await page.fill("#email", `service-admin-${suffixe}@vertexone.test`);
  await page.fill("#motDePasse", MOT_DE_PASSE);
  await page.click('button[type="submit"]');
  await page.waitForURL("/app", { timeout: 120_000 });

  // ===== Création =====
  await page.goto("/app/reservations/services");
  await page.getByRole("button", { name: "Nouveau service" }).click();
  await page.fill("#nom", "Coupe homme");
  await page.fill("#dureeMinutes", "30");
  await page.fill("#prixFcfa", "3000");
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(page.getByText("Coupe homme", { exact: true })).toBeVisible(ATTENTE);
  await expect(page.getByText("30 min", { exact: true })).toBeVisible(ATTENTE);

  // ===== Annuler une modification ne change rien =====
  await page.getByRole("button", { name: "Modifier Coupe homme" }).click();
  // Le formulaire de création reste ouvert à côté : on cible uniquement le formulaire de modification.
  const formulaire = page.getByRole("form", { name: "Modifier Coupe homme" });
  await formulaire.getByLabel("Nom", { exact: true }).fill("Brouillon");
  await formulaire.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByText("Coupe homme", { exact: true })).toBeVisible();
  await expect(page.getByText("Brouillon")).toHaveCount(0);

  // ===== Modification =====
  await page.getByRole("button", { name: "Modifier Coupe homme" }).click();
  const edition = page.getByRole("form", { name: "Modifier Coupe homme" });
  await expect(edition.getByLabel("Nom", { exact: true })).toHaveValue("Coupe homme"); // formulaire prérempli
  await edition.getByLabel("Nom", { exact: true }).fill("Coupe homme premium");
  await edition.getByLabel("Durée (min)").fill("45");
  await edition.getByLabel("Prix (FCFA)").fill("4500");
  await edition.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Coupe homme premium", { exact: true })).toBeVisible(ATTENTE);
  await expect(page.getByText("45 min", { exact: true })).toBeVisible(ATTENTE);

  // Retrouvé après rechargement (réellement enregistré), et refus d'une valeur invalide.
  await page.reload();
  await expect(page.getByText("Coupe homme premium", { exact: true })).toBeVisible(ATTENTE);
  await page.getByRole("button", { name: "Modifier Coupe homme premium" }).click();
  const invalide = page.getByRole("form", { name: "Modifier Coupe homme premium" });
  await invalide.getByLabel("Nom", { exact: true }).fill("   ");
  await invalide.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Le nom est requis.")).toBeVisible(ATTENTE);
});

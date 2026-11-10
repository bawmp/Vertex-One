import { test, expect } from "@playwright/test";
import { db } from "../src/db/client";
import { utilisateur } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { supprimerEntrepriseDeTest } from "../tests/aide-nettoyage";

// Parcours : un Administrateur écrit un rapport de mission à un autre Administrateur avec l'assistant à modèles
// (galerie → formulaire guidé → envoi), puis le retrouve dans « Envoyés » et l'ouvre.
const suffixe = Date.now().toString(36);
const nomEntreprise = `TEST E2E Rapports ${suffixe}`;
const email = `e2e-rapports-${suffixe}@vertexone.test`;
const emailSecond = `e2e-rapports-dest-${suffixe}@vertexone.test`;
const motDePasse = "mot-de-passe-test-12345";
const CAPTURES = process.env.CAPTURES_RAPPORTS ?? "";

test.afterAll(async () => {
  await supprimerEntrepriseDeTest(nomEntreprise);
});

test("assistant de rapport : choisir un modèle, remplir, envoyer, retrouver", async ({ page }) => {
  test.setTimeout(240_000);

  await page.goto("/inscription");
  await page.fill("#nomEntreprise", nomEntreprise);
  await page.getByRole("radio", { name: "Agence" }).click();
  await page.fill("#nomComplet", "Admin Rapports");
  await page.fill("#email", email);
  await page.fill("#motDePasse", motDePasse);
  await page.click('button[type="submit"]');
  await page.waitForURL("/app");

  // Un second Administrateur pour recevoir (inséré en base : il n'a pas besoin de se connecter).
  const [moi] = await db.select().from(utilisateur).where(eq(utilisateur.email, email));
  await db.insert(utilisateur).values({ entrepriseId: moi.entrepriseId, email: emailSecond, nomComplet: "Directeur Destinataire", role: "ADMIN" });

  await page.goto("/app/rh/rapports-ecrits");
  await expect(page.getByRole("heading", { name: "Rapports écrits" })).toBeVisible({ timeout: 60_000 });
  if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/1-liste-vide.png`, fullPage: true });

  await page.locator("a", { hasText: "Nouveau rapport" }).first().click(); // un Button rendu en lien n'a pas le rôle « link »
  await expect(page.getByText("Quel type de rapport voulez-vous écrire ?")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: /Rapport de travaux/ })).toBeVisible();
  if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/2-galerie.png`, fullPage: true });

  await page.getByRole("button", { name: /Rapport de mission/ }).click();
  await expect(page.getByRole("progressbar")).toBeVisible();

  // Rien d'obligatoire rempli : l'envoi est refusé en nommant la rubrique manquante, et la saisie reste à l'écran.
  await page.fill("#objet", "Mission — Audit Douala");
  await page.getByRole("button", { name: "Envoyer le rapport" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("est requise"); // pas getByRole("alert") : Next.js a aussi un annonceur de page
  await expect(page.locator("#objet")).toHaveValue("Mission — Audit Douala");

  await page.getByLabel(/Objectif de la mission/).fill("Auditer le dépôt de Douala.");
  await page.getByLabel(/Déroulement/).fill("Visite du dépôt, entretien avec le chef de site.");
  await page.getByLabel(/Résultats obtenus/).fill("Conformité confirmée.");
  await expect(page.getByText("Prêt à envoyer !")).toBeVisible();
  if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/3-formulaire-rempli.png`, fullPage: true });

  await page.getByRole("button", { name: "Envoyer le rapport" }).click();
  await expect(page.getByText("Rapport envoyé !")).toBeVisible({ timeout: 60_000 });
  if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/4-envoye.png`, fullPage: true });

  await page.locator("a", { hasText: "Voir mes rapports envoyés" }).click();
  const carte = page.getByRole("link", { name: /Mission — Audit Douala/ });
  await expect(carte).toBeVisible({ timeout: 60_000 });
  await expect(carte).toContainText("Directeur Destinataire");
  await expect(carte).toContainText("Non lu");
  if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/5-envoyes.png`, fullPage: true });

  await carte.click();
  await expect(page.getByRole("heading", { name: "Mission — Audit Douala" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Conformité confirmée.")).toBeVisible();
  // Papier à en-tête : nom de l'entreprise, bloc De / À / Date, signature, mention de confidentialité.
  await expect(page.getByText(nomEntreprise).first()).toBeVisible();
  await expect(page.getByText("Document confidentiel")).toBeVisible();
  await page.waitForTimeout(1500); // laisse finir les animations avant la capture
  if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/6-detail.png`, fullPage: true });

  // PDF sur papier à en-tête : même session, même contrôle d'accès que la page.
  const reponse = await page.request.get(`${page.url()}/pdf`);
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()["content-type"]).toContain("application/pdf");
  const octets = await reponse.body();
  expect(octets.subarray(0, 4).toString()).toBe("%PDF");
  if (CAPTURES) (await import("node:fs")).writeFileSync(`${CAPTURES}/rapport.pdf`, octets);
});

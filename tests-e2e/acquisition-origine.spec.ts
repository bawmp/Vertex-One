import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { entreprise, utilisateur } from "../src/db/schema";
import { supprimerEntrepriseDeTest } from "../tests/aide-nettoyage";

// Parcours : un visiteur arrive par un lien de campagne, explore le site, puis s'inscrit plus tard — l'origine mémorisée dans le cookie
// est rangée sur son entreprise (suivi commercial, Console interne → Acquisition). Vérifié dans un vrai navigateur.
const suffixe = Date.now();
const email = `e2e-origine-${suffixe}@vertexone.test`;
const nomEntreprise = `TEST E2E Origine ${suffixe}`;
const motDePasse = "mot-de-passe-test-12345";

test.setTimeout(150_000);

test.afterAll(async () => {
  // Nettoyage complet (en cascade sur toutes les tables de l'entreprise, puis account/session) : le secteur « immigration » crée des
  // champs personnalisés qui empêchent une simple suppression de l'entreprise.
  await supprimerEntrepriseDeTest(nomEntreprise);
});

test("un lien de campagne puis l'inscription : l'origine et le secteur présélectionné sont enregistrés", async ({ page, context }) => {
  // 1. Le visiteur arrive par une publicité Facebook sur la page des tarifs.
  await page.goto("/tarifs?utm_source=Facebook&utm_medium=pub&utm_campaign=mobilite-nov");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect
    .poll(async () => (await context.cookies()).find((c) => c.name === "vertexone-origine")?.value ?? "")
    .toContain("facebook");

  // 2. Il revient plus tard directement sur l'inscription : l'origine de la campagne n'est pas écrasée par ce retour direct.
  await page.goto("/inscription?secteur=immigration");
  await expect(page.getByRole("radio", { name: /Immigration et mobilité/ })).toHaveAttribute("aria-checked", "true");

  await page.fill("#nomEntreprise", nomEntreprise);
  await page.fill("#nomComplet", "Admin Origine");
  await page.fill("#email", email);
  await page.fill("#motDePasse", motDePasse);
  await page.click('button[type="submit"]');
  await page.waitForURL("/app");

  // 3. L'origine est rangée sur l'entreprise, jamais lue d'ailleurs que du cookie nettoyé côté serveur.
  const [u] = await db.select().from(utilisateur).where(eq(utilisateur.email, email));
  const [e] = await db.select().from(entreprise).where(eq(entreprise.id, u.entrepriseId));
  expect(e).toMatchObject({ secteurProfil: "immigration", origineSource: "facebook", origineSupport: "pub", origineCampagne: "mobilite-nov", origineParrain: null });
});

import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { creerEquipe, MOT_DE_PASSE, supprimerEntrepriseDeTest, type Equipe } from "./aide-equipe";
import { db } from "../src/db/client";
import { entreprise, groupe } from "../src/db/schema";

// L'Administrateur d'une entreprise propose le transfert d'un employé vers une autre entreprise du même groupe ; l'Administrateur d'accueil
// accepte ; l'employé se reconnecte avec les mêmes identifiants et arrive chez l'accueil.
let equipe: Equipe | null = null;
let nomAccueil = "";
let groupeId = "";
test.afterAll(async () => {
  test.setTimeout(300_000); // nettoyage réel sous la latence Neon
  await equipe?.contexteEmploye.close();
  if (equipe) await supprimerEntrepriseDeTest(equipe.nomEntreprise);
  if (nomAccueil) await supprimerEntrepriseDeTest(nomAccueil);
  if (groupeId) await db.delete(groupe).where(eq(groupe.id, groupeId));
});

test("Transfert d'employé : proposé par l'origine, accepté par l'accueil, l'employé se reconnecte chez l'accueil", async ({ page, browser }) => {
  test.setTimeout(500_000);
  equipe = await creerEquipe(page, browser, "transfert");
  const { admin, emailEmploye } = equipe;

  // Entreprise d'accueil (inscription réelle, autre contexte), puis les deux entreprises rejoignent un même groupe.
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  nomAccueil = `TEST accueil ${suffixe}`;
  const contexteAccueil = await browser.newContext();
  const adminAccueil = await contexteAccueil.newPage();
  await adminAccueil.goto("/inscription");
  await adminAccueil.fill("#nomEntreprise", nomAccueil);
  await adminAccueil.getByRole("radio", { name: "Agence" }).click();
  await adminAccueil.fill("#nomComplet", "Claire Accueil");
  await adminAccueil.fill("#email", `accueil-${suffixe}@vertexone.test`);
  await adminAccueil.fill("#motDePasse", MOT_DE_PASSE);
  await adminAccueil.click('button[type="submit"]');
  await adminAccueil.waitForURL("/app", { timeout: 90_000 });

  const [g] = await db.insert(groupe).values({ nom: `TEST Groupe ${suffixe}` }).returning({ id: groupe.id });
  groupeId = g.id;
  await db.update(entreprise).set({ groupeId }).where(eq(entreprise.nom, equipe.nomEntreprise));
  await db.update(entreprise).set({ groupeId }).where(eq(entreprise.nom, nomAccueil));

  // 1. L'Administrateur d'origine propose le transfert de Bob.
  await admin.goto("/app/rh/transferts");
  await admin.getByLabel("Collaborateur à transférer").selectOption({ index: 1 }); // seul Bob est transférable (l'Administrateur ne se transfère pas lui-même)
  await admin.getByLabel("Vers l'entreprise").selectOption({ label: nomAccueil });
  await admin.getByLabel("Message pour l'Administrateur d'accueil (optionnel)").fill("Mutation à Douala");
  await admin.getByRole("button", { name: "Proposer le transfert" }).click();
  await expect(admin.getByText("Demande envoyée")).toBeVisible({ timeout: 60_000 });
  await admin.setViewportSize({ width: 1440, height: 900 });
  await admin.screenshot({ path: "test-results/transfert-origine-ordinateur.png", fullPage: true });

  // 2. L'Administrateur d'accueil voit la demande et accepte.
  await adminAccueil.goto("/app/rh/transferts");
  await expect(adminAccueil.getByText("Bob Employé voudrait rejoindre votre entreprise")).toBeVisible({ timeout: 90_000 });
  await adminAccueil.setViewportSize({ width: 1440, height: 900 });
  await adminAccueil.screenshot({ path: "test-results/transfert-accueil-ordinateur.png", fullPage: true });
  await adminAccueil.setViewportSize({ width: 390, height: 844 });
  await adminAccueil.goto("/app/rh/transferts"); // recharge à la taille mobile (le menu latéral se replie)
  await expect(adminAccueil.getByText("Bob Employé voudrait rejoindre votre entreprise")).toBeVisible({ timeout: 90_000 });
  await adminAccueil.screenshot({ path: "test-results/transfert-accueil-mobile.png", fullPage: true });
  const { largeurPage, largeurFenetre } = await adminAccueil.evaluate(() => ({ largeurPage: document.documentElement.scrollWidth, largeurFenetre: window.innerWidth }));
  expect(largeurPage).toBeLessThanOrEqual(largeurFenetre);
  adminAccueil.once("dialog", (d) => d.accept());
  await adminAccueil.getByRole("button", { name: "Accepter le transfert" }).click();
  await expect(adminAccueil.getByText("Transfert effectué")).toBeVisible({ timeout: 90_000 });

  // 3. Bob est déconnecté (sessions fermées), se reconnecte avec les mêmes identifiants et arrive chez l'accueil.
  const bob = equipe.employe;
  await bob.goto("/app");
  await bob.waitForURL(/connexion/, { timeout: 90_000 });
  await bob.fill("#email", emailEmploye);
  await bob.fill("#motDePasse", MOT_DE_PASSE);
  await bob.click('button[type="submit"]');
  await bob.waitForURL("/app", { timeout: 90_000 });
  await expect(bob.getByText(nomAccueil).first()).toBeVisible({ timeout: 60_000 });
  await bob.goto("/app/rh");
  await expect(bob.getByText("Bob Employé").first()).toBeVisible({ timeout: 90_000 });

  // 4. Côté origine, Bob n'est plus un collaborateur actif ; l'historique des transferts garde la trace.
  await admin.goto("/app/rh/transferts");
  await expect(admin.getByText("Transfert effectué")).toBeVisible({ timeout: 60_000 });
  await contexteAccueil.close();
});

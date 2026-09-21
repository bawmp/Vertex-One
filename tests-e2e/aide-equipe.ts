import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const MOT_DE_PASSE = "mot-de-passe-test-12345";

export type Equipe = {
  nomEntreprise: string;
  admin: Page;
  employe: Page;
  contexteEmploye: BrowserContext;
  emailAdmin: string;
  emailEmploye: string;
};

/**
 * Crée une entreprise « TEST … » (inscription réelle) avec un Administrateur, puis y invite un Employé qui active son
 * compte par le lien d'invitation. Les deux pages restent connectées dans des contextes séparés (deux sessions).
 */
export async function creerEquipe(page: Page, browser: Browser, prefixe: string): Promise<Equipe> {
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const nomEntreprise = `TEST ${prefixe} ${suffixe}`;
  const emailAdmin = `${prefixe}-admin-${suffixe}@vertexone.test`;
  const emailEmploye = `${prefixe}-employe-${suffixe}@vertexone.test`;

  await page.goto("/inscription");
  await page.fill("#nomEntreprise", nomEntreprise);
  await page.selectOption("#secteurProfil", "agence");
  await page.fill("#nomComplet", "Alice Admin");
  await page.fill("#email", emailAdmin);
  await page.fill("#motDePasse", MOT_DE_PASSE);
  await page.click('button[type="submit"]');
  await page.waitForURL("/app", { timeout: 90_000 });

  await page.goto("/app/parametres/equipe");
  await page.fill("#email", emailEmploye);
  await page.getByRole("button", { name: "Inviter", exact: true }).click();
  const texte = await page.getByText(/Invitation créée : \/invitation\//).innerText();
  const lien = texte.replace("Invitation créée : ", "").trim();

  const contexteEmploye = await browser.newContext();
  const employe = await contexteEmploye.newPage();
  await employe.goto(lien);
  await employe.fill("#nomComplet", "Bob Employé");
  await employe.fill("#motDePasse", MOT_DE_PASSE);
  await employe.click('button[type="submit"]');
  await employe.waitForURL(/connexion|\/app/, { timeout: 90_000 });
  if (employe.url().includes("connexion")) {
    await employe.fill("#email", emailEmploye);
    await employe.fill("#motDePasse", MOT_DE_PASSE);
    await employe.click('button[type="submit"]');
  }
  await employe.waitForURL("/app", { timeout: 90_000 });
  await expect(employe).toHaveURL(/\/app$/);

  return { nomEntreprise, admin: page, employe, contexteEmploye, emailAdmin, emailEmploye };
}

export { supprimerEntrepriseDeTest } from "../tests/aide-nettoyage";

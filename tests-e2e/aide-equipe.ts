import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";

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

/**
 * Supprime l'entreprise de test et tout ce qui s'y rattache, via la connexion propriétaire (TCP direct, plus réactive que
 * le WebSocket sous latence Neon). Les tables sont vidées par tours successifs : celles dont une clé étrangère bloque
 * encore sont retentées au tour suivant, sans avoir à connaître l'ordre des dépendances.
 */
export async function supprimerEntrepriseDeTest(nomEntreprise: string): Promise<void> {
  if (!nomEntreprise.startsWith("TEST ")) throw new Error("Nettoyage refusé : seul un nom d'entreprise préfixé « TEST » est supprimable.");
  const c = new Client({ connectionString: process.env.DATABASE_URL_MIGRATIONS });
  await c.connect();
  try {
    const ids = (await c.query("select id from entreprise where nom = $1", [nomEntreprise])).rows.map((r) => r.id as string);
    if (ids.length === 0) return;
    const tables = (await c.query("select table_name from information_schema.columns where column_name = 'entreprise_id' and table_schema = 'public'")).rows
      .map((r) => r.table_name as string)
      .filter((t) => t !== "entreprise");
    await c.query("delete from account where user_id in (select id from utilisateur where entreprise_id = any($1))", [ids]);
    await c.query("delete from session where user_id in (select id from utilisateur where entreprise_id = any($1))", [ids]);
    let restantes = tables;
    for (let tour = 0; tour < 12 && restantes.length > 0; tour++) {
      const echecs: string[] = [];
      for (const t of restantes) {
        try {
          await c.query(`delete from "${t}" where entreprise_id = any($1)`, [ids]);
        } catch {
          echecs.push(t);
        }
      }
      restantes = echecs;
    }
    await c.query("delete from entreprise where id = any($1)", [ids]);
  } finally {
    await c.end();
  }
}

import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { creerEquipe, supprimerEntrepriseDeTest, type Equipe } from "./aide-equipe";
import { avecEntreprise, db } from "../src/db/client";
import { entreprise, invitation, utilisateur } from "../src/db/schema";

// Un Manager demande l'ajout d'un collaborateur : rien n'est envoyé ; l'Administrateur voit la demande, la corrige et la confirme ; l'invitation part.
let equipe: Equipe | null = null;
test.afterAll(async () => {
  test.setTimeout(240_000); // nettoyage réel sous la latence Neon
  await equipe?.contexteEmploye.close();
  if (equipe) await supprimerEntrepriseDeTest(equipe.nomEntreprise);
});

test("Fiche demandée par un Manager, confirmée par l'Administrateur", async ({ page, browser }) => {
  test.setTimeout(400_000);
  equipe = await creerEquipe(page, browser, "demande");
  const { admin, employe: manager, emailEmploye } = equipe;
  await db.update(utilisateur).set({ role: "MANAGER" }).where(eq(utilisateur.email, emailEmploye));
  const [{ id: entrepriseId }] = await db.select({ id: entreprise.id }).from(entreprise).where(eq(entreprise.nom, equipe.nomEntreprise));
  const adresse = `nouveau-${Date.now()}@vertexone.test`;

  // 1. Le Manager dépose sa demande : le formulaire le dit, sans champ salaire.
  await manager.goto("/app/rh/nouveau");
  await expect(manager.getByText("Votre demande est transmise à l'Administrateur")).toBeVisible({ timeout: 90_000 });
  expect(await manager.locator('input[name*="salaire" i], input[id*="salaire" i]').count()).toBe(0);
  await manager.fill("#email", adresse);
  await manager.fill("#poste", "Assistant commercial");
  await manager.fill("#dateEmbauche", "2027-01-04");
  await manager.getByRole("button", { name: "Envoyer la demande à l'Administrateur" }).click();
  await expect(manager.getByText("Demande envoyée à l'Administrateur")).toBeVisible({ timeout: 60_000 });
  // Rien n'a été créé : pas d'invitation.
  expect(await avecEntreprise(entrepriseId, (tx) => tx.select({ id: invitation.id }).from(invitation).where(eq(invitation.email, adresse)))).toHaveLength(0);
  await manager.goto("/app/rh/a-confirmer");
  await expect(manager.getByText(adresse)).toBeVisible({ timeout: 90_000 });
  await expect(manager.getByRole("button", { name: "Retirer ma demande" })).toBeVisible();

  // 2. L'Administrateur voit la bannière, corrige le poste et confirme.
  await admin.setViewportSize({ width: 1440, height: 900 });
  await admin.goto("/app/rh");
  await expect(admin.getByText("1 fiche attend votre confirmation")).toBeVisible({ timeout: 90_000 });
  await admin.getByText("1 fiche attend votre confirmation").click();
  await expect(admin.getByRole("heading", { name: "Fiches à confirmer" })).toBeVisible({ timeout: 90_000 });
  await expect(admin.getByText(adresse)).toBeVisible();
  expect(await admin.locator('input[name*="salaire" i]').count()).toBe(0); // le salaire se saisit sur la fiche, après activation
  await admin.screenshot({ path: "test-results/demande-admin-ordinateur.png", fullPage: true });
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.goto("/app/rh/a-confirmer");
  await expect(admin.getByText(adresse)).toBeVisible({ timeout: 90_000 });
  await admin.screenshot({ path: "test-results/demande-admin-mobile.png", fullPage: true });
  const { largeurPage, largeurFenetre } = await admin.evaluate(() => ({ largeurPage: document.documentElement.scrollWidth, largeurFenetre: window.innerWidth }));
  expect(largeurPage).toBeLessThanOrEqual(largeurFenetre);
  await admin.getByLabel("Poste").fill("Responsable commercial");
  await admin.getByRole("button", { name: "Confirmer et inviter" }).click();
  await expect(admin.getByText("Fiche confirmée")).toBeVisible({ timeout: 90_000 });

  // 3. L'invitation existe, avec le poste corrigé et le Manager comme responsable.
  const [inv] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(invitation).where(eq(invitation.email, adresse)));
  expect(inv).toMatchObject({ roleProposee: "EMPLOYE", postePropose: "Responsable commercial" });
  await manager.goto("/app/rh/a-confirmer");
  await expect(manager.getByText("Confirmée")).toBeVisible({ timeout: 90_000 });
});

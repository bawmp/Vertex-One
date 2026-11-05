import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { creerEquipe, supprimerEntrepriseDeTest, type Equipe } from "./aide-equipe";
import { db } from "../src/db/client";
import { utilisateur } from "../src/db/schema";

// Un Employé invité sans module coché n'a que sa fiche, ses tâches et le chat ; l'Administrateur lui ouvre ensuite un module.
let equipe: Equipe | null = null;
test.afterAll(async () => {
  await equipe?.contexteEmploye.close();
  if (equipe) await supprimerEntrepriseDeTest(equipe.nomEntreprise);
});

test("Employé : socle seul à l'activation, puis un module accordé par l'Administrateur", async ({ page, browser }) => {
  test.setTimeout(300_000);
  equipe = await creerEquipe(page, browser, "socle");
  const { employe, emailEmploye } = equipe;
  const nav = employe.locator("nav");
  await expect(nav.getByText("One Chat", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  await expect(nav.getByText("One People", { exact: true }).first()).toBeVisible();
  await expect(nav.getByText("One Projects", { exact: true }).first()).toBeVisible();
  await expect(nav.getByText("One CRM", { exact: true })).toHaveCount(0);
  await expect(nav.getByText("One Docs", { exact: true })).toHaveCount(0);
  await expect(nav.getByText("One Marketing", { exact: true })).toHaveCount(0);

  // Un module fermé l'est aussi par l'adresse directe, pas seulement dans le menu.
  await employe.goto("/app/documents");
  await expect(employe.getByRole("heading", { name: /documents/i })).toHaveCount(0);

  const [{ modules }] = await db.select({ modules: utilisateur.modulesAutorises }).from(utilisateur).where(eq(utilisateur.email, emailEmploye));
  expect(modules).toEqual(["RH", "PROJETS", "MESSAGERIE"]);

  await db.update(utilisateur).set({ modulesAutorises: ["RH", "PROJETS", "MESSAGERIE", "DOCUMENTS"] }).where(eq(utilisateur.email, emailEmploye));
  await employe.goto("/app");
  await expect(employe.locator("nav").getByText("One Docs", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
});

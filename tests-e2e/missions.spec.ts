import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { creerEquipe, supprimerEntrepriseDeTest, type Equipe } from "./aide-equipe";
import { avecEntreprise, db } from "../src/db/client";
import { dossierRH, entreprise, mission, utilisateur } from "../src/db/schema";
import { ajouterJours, aujourdhuiDouala } from "../src/lib/facturation/promesse-regles";

// L'Administrateur confie une mission par le formulaire ; d'autres sont posées en base pour avoir une page représentative ; l'employé met à
// jour son avancement ; le rendu est contrôlé sur ordinateur et sur mobile (aucun débordement horizontal).
let equipe: Equipe | null = null;
test.afterAll(async () => {
  test.setTimeout(240_000); // nettoyage réel sous la latence Neon
  await equipe?.contexteEmploye.close();
  if (equipe) await supprimerEntrepriseDeTest(equipe.nomEntreprise);
});

async function sansDebordement(page: Page) {
  const { largeurPage, largeurFenetre } = await page.evaluate(() => ({ largeurPage: document.documentElement.scrollWidth, largeurFenetre: window.innerWidth }));
  expect(largeurPage).toBeLessThanOrEqual(largeurFenetre);
}

test("Missions : confiées par l'Administrateur, suivies par l'employé, lisibles sur ordinateur et sur mobile", async ({ page, browser }) => {
  test.setTimeout(400_000);
  equipe = await creerEquipe(page, browser, "missions");
  const { admin, employe, emailEmploye, emailAdmin } = equipe;

  // 1. L'Administrateur confie une mission mensuelle par le formulaire.
  await admin.goto("/app/rh/missions");
  await admin.getByRole("button", { name: "Confier une mission" }).click({ timeout: 90_000 });
  await admin.getByLabel("Confier à").selectOption({ label: "Bob Employé" });
  await admin.getByLabel("Mission", { exact: true }).fill("Signer 5 nouveaux clients");
  await admin.getByText("Mensuelle", { exact: true }).click();
  await expect(admin.getByLabel("Renouveler automatiquement chaque mois")).toBeChecked();
  await admin.getByLabel("Résultat attendu (optionnel)").fill("5 contrats signés avant la fin du mois");
  await admin.getByRole("button", { name: "Confier la mission" }).click();
  await expect(admin.getByText("Mission confiée.")).toBeVisible({ timeout: 60_000 });
  // La case « renouveler » est cochée par défaut pour une mission du mois : l'étiquette s'affiche sur la carte.
  await expect(admin.getByText("Se renouvelle chaque mois").first()).toBeVisible({ timeout: 60_000 });

  // 2. Missions supplémentaires posées en base : en retard, longue durée avancée, permanente.
  const [{ id: entrepriseId }] = await db.select({ id: entreprise.id }).from(entreprise).where(eq(entreprise.nom, equipe.nomEntreprise));
  const [bob] = await db.select({ id: utilisateur.id }).from(utilisateur).where(eq(utilisateur.email, emailEmploye));
  const [alice] = await db.select({ id: utilisateur.id }).from(utilisateur).where(eq(utilisateur.email, emailAdmin));
  const jour = aujourdhuiDouala();
  const base = { entrepriseId, utilisateurId: bob.id, creeParId: alice.id };
  await avecEntreprise(entrepriseId, (tx) =>
    tx.insert(mission).values([
      { ...base, titre: "Rapport hebdomadaire des ventes", horizon: "HEBDOMADAIRE", dateDebut: ajouterJours(jour, -9), dateFin: ajouterJours(jour, -3), avancement: 30, noteSuivi: "En attente des chiffres de Douala" },
      { ...base, titre: "Refondre le catalogue produits et mettre à jour toutes les photos de la boutique", horizon: "LONGUE_DUREE", dateDebut: ajouterJours(jour, -20), dateFin: ajouterJours(jour, 70), avancement: 40, resultatAttendu: "Catalogue complet en ligne" },
      { ...base, titre: "Répondre aux clients sous 24 h", horizon: "PERMANENTE", dateDebut: ajouterJours(jour, -5), dateFin: null },
    ]),
  );

  // 3. L'employé met à jour sa mission mensuelle : curseur, palier 50 %, point de suivi.
  await employe.goto("/app/rh/missions");
  const carte = employe.locator("li", { hasText: "Signer 5 nouveaux clients" });
  await expect(carte).toBeVisible({ timeout: 90_000 });
  await carte.getByRole("button", { name: "Mettre à jour" }).click();
  await carte.getByRole("button", { name: "50 %", exact: true }).click();
  await carte.getByLabel("Point de suivi (optionnel)").fill("3 contrats en négociation");
  await carte.getByRole("button", { name: "Enregistrer" }).click();
  await expect(carte.getByText("3 contrats en négociation")).toBeVisible({ timeout: 60_000 });
  await expect(carte.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");

  // L'employé ne peut ni annuler ni supprimer ; il filtre par durée.
  await expect(employe.getByRole("button", { name: "Annuler la mission" })).toHaveCount(0);
  await employe.getByRole("button", { name: /Permanentes/ }).click();
  await expect(employe.getByText("Répondre aux clients sous 24 h")).toBeVisible();
  await expect(employe.getByText("Signer 5 nouveaux clients")).toHaveCount(0);
  await employe.getByRole("button", { name: /Toutes/ }).click();

  // 4. Captures et contrôle de débordement : ordinateur puis mobile, côté employé et côté Administrateur.
  for (const [nom, taille] of [["ordinateur", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
    for (const [qui, p] of [["employe", employe], ["admin", admin]] as const) {
      await p.setViewportSize(taille);
      await p.goto("/app/rh/missions");
      await expect(p.getByRole("heading", { name: "Missions", exact: true })).toBeVisible({ timeout: 90_000 });
      await p.waitForTimeout(800);
      await p.screenshot({ path: `test-results/missions-${qui}-${nom}.png`, fullPage: true });
      await sansDebordement(p);
    }
  }

  // La fiche affiche aussi les missions (carte « Missions »).
  await admin.setViewportSize({ width: 1440, height: 900 });
  const [{ dossierId }] = await avecEntreprise(entrepriseId, (tx) => tx.select({ dossierId: dossierRH.id }).from(dossierRH).where(eq(dossierRH.utilisateurId, bob.id)));
  await admin.goto(`/app/rh/${dossierId}`);
  await expect(admin.getByRole("heading", { name: "Missions", exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(admin.getByText("Rapport hebdomadaire des ventes")).toBeVisible();
  await admin.screenshot({ path: "test-results/missions-fiche-ordinateur.png", fullPage: true });
});

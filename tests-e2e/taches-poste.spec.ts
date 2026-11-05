import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { creerEquipe, supprimerEntrepriseDeTest, type Equipe } from "./aide-equipe";
import { avecEntreprise, db } from "../src/db/client";
import { dossierRH, entreprise, utilisateur } from "../src/db/schema";

// L'Administrateur pose une tâche du poste sur la fiche d'un employé ; l'employé la voit (sans pouvoir la modifier) ; elle se retire.
let equipe: Equipe | null = null;
test.afterAll(async () => {
  await equipe?.contexteEmploye.close();
  if (equipe) await supprimerEntrepriseDeTest(equipe.nomEntreprise);
});

test("Tâches du poste : posées par l'Administrateur, lues par l'employé", async ({ page, browser }) => {
  test.setTimeout(300_000);
  equipe = await creerEquipe(page, browser, "tposte");
  const { admin, employe, emailEmploye } = equipe;
  const [{ id: entrepriseId }] = await db.select({ id: entreprise.id }).from(entreprise).where(eq(entreprise.nom, equipe.nomEntreprise));
  // dossier_rh est protégé par RLS : la lecture passe par la transaction de l'entreprise.
  const [{ dossierId }] = await avecEntreprise(entrepriseId, (tx) => tx.select({ dossierId: dossierRH.id }).from(dossierRH).innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id)).where(eq(utilisateur.email, emailEmploye)));

  await admin.goto(`/app/rh/${dossierId}`);
  await admin.getByRole("button", { name: "Ajouter une tâche du poste" }).click({ timeout: 90_000 });
  await admin.getByLabel("Tâche", { exact: true }).fill("Relancer les factures en retard");
  await admin.getByLabel("Fréquence").selectOption("HEBDOMADAIRE");
  await admin.getByRole("button", { name: "Ajouter la tâche" }).click();
  await expect(admin.getByText("Relancer les factures en retard")).toBeVisible({ timeout: 60_000 });
  await admin.screenshot({ path: "test-results/taches-poste-admin.png" });

  // L'employé la voit sur sa propre fiche, sans bouton d'ajout ni de retrait.
  await employe.goto(`/app/rh/${dossierId}`);
  await expect(employe.getByText("Relancer les factures en retard")).toBeVisible({ timeout: 90_000 });
  await expect(employe.getByText("Chaque semaine")).toBeVisible();
  await expect(employe.getByRole("button", { name: "Ajouter une tâche du poste" })).toHaveCount(0);
  await expect(employe.getByRole("button", { name: "Retirer la tâche" })).toHaveCount(0);

  await admin.getByRole("button", { name: "Retirer la tâche" }).click();
  await expect(admin.getByText("Relancer les factures en retard")).toHaveCount(0, { timeout: 60_000 });
});

import { test, expect } from "@playwright/test";
import { creerEquipe, type Equipe } from "./aide-equipe";
import { supprimerEntrepriseDeTest } from "../tests/aide-nettoyage";

/**
 * Rédiger un document (Documents → Rédiger un document) : création, saisie dans l'éditeur, mise en page, enregistrement
 * automatique, export PDF et Word, et ISOLATION — l'Employé (portée « propre ») ne voit ni n'exporte le document de
 * l'Administrateur. Vérifié dans un vrai navigateur avec une vraie base.
 */
let equipe: Equipe | null = null;

test.afterAll(async () => {
  test.setTimeout(120_000);
  if (equipe) {
    await equipe.contexteEmploye.close();
    await supprimerEntrepriseDeTest(equipe.nomEntreprise);
  }
});

test("rédaction : création, saisie, en-tête et numéros, export PDF/Word, isolation", async ({ page, browser }) => {
  test.setTimeout(300_000);
  equipe = await creerEquipe(page, browser, "redaction");
  const admin = equipe.admin;

  await admin.goto("/app/documents");
  await admin.getByRole("link", { name: "Rédiger un document" }).click();
  await admin.waitForURL("**/app/documents/rediger");
  await admin.fill("#nouveau-titre", "TEST Contrat de prestation");
  await admin.getByRole("button", { name: "Créer et rédiger" }).click();
  await admin.waitForURL(/\/app\/documents\/rediger\/[a-z0-9]+$/, { timeout: 90_000 });
  const idDocument = admin.url().split("/").pop()!;

  // Saisie dans l'éditeur
  const editeur = admin.locator(".editeur-contenu");
  await expect(editeur).toBeVisible({ timeout: 60_000 });
  await editeur.click();
  await admin.keyboard.type("Article premier — Objet du contrat");
  await admin.getByLabel("Style de paragraphe").selectOption("1");
  await admin.keyboard.press("End");
  await admin.keyboard.press("Enter");
  await admin.keyboard.type("Le prestataire s'engage à accompagner le client dans sa demande de visa.");
  await admin.getByRole("button", { name: "Gras" }).click();
  await admin.keyboard.type(" Honoraires : 50 000 FCFA.");
  await admin.getByRole("button", { name: "Insérer un tableau (3 × 3)" }).click();
  await admin.getByRole("button", { name: "Saut de page" }).click();
  await admin.keyboard.type("Fait à Yaoundé, en deux exemplaires.");

  // Mise en page : référence, texte de pied, numérotation « Page 2 / 5 » (défaut)
  await admin.fill("#reference", "CT-E2E-001");
  await admin.fill("#pied-gauche", "Yaoundé, Mendong");
  await admin.fill("#entete-droite", "Confidentiel");

  // La feuille montre l'en-tête et le pied simulés
  await expect(admin.getByText("CT-E2E-001").first()).toBeVisible();
  await expect(admin.getByText("Yaoundé, Mendong").first()).toBeVisible();

  // Enregistrement automatique (1,5 s après la dernière modification)
  await expect(admin.getByRole("status").filter({ hasText: "Enregistré" })).toBeVisible({ timeout: 60_000 });
  await admin.screenshot({ path: "test-results/redaction-editeur.png", fullPage: true });

  // Export PDF et Word (session de l'administrateur)
  const pdf = await admin.request.get(`/app/documents/rediger/${idDocument}/export?format=pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  const octetsPdf = await pdf.body();
  expect(octetsPdf.subarray(0, 4).toString()).toBe("%PDF");
  const word = await admin.request.get(`/app/documents/rediger/${idDocument}/export?format=docx`);
  expect(word.status()).toBe(200);
  expect((await word.body()).subarray(0, 2).toString()).toBe("PK");

  // Aperçu PDF intégré
  await admin.getByRole("button", { name: "Aperçu PDF" }).click();
  await expect(admin.getByRole("dialog", { name: "Aperçu PDF" })).toBeVisible({ timeout: 60_000 });
  await expect(admin.locator("iframe[title='Aperçu du PDF']")).toHaveAttribute("src", /format=pdf&apercu=1/);
  await admin.getByRole("button", { name: "Fermer l'aperçu" }).click();

  // La liste le montre
  await admin.goto("/app/documents/rediger");
  await expect(admin.getByText("TEST Contrat de prestation")).toBeVisible();

  // ISOLATION : l'Employé (portée « propre ») ne le voit pas et ne peut ni l'ouvrir ni l'exporter
  const employe = equipe.employe;
  await employe.goto("/app/documents/rediger");
  await expect(employe.getByText("TEST Contrat de prestation")).toHaveCount(0);
  for (const format of ["pdf", "docx"]) {
    const refuse = await employe.request.get(`/app/documents/rediger/${idDocument}/export?format=${format}`);
    expect(refuse.status(), `export ${format} par un autre utilisateur`).toBe(404);
  }
  // Page d'un autre utilisateur : « page introuvable » (le statut HTTP reste 200 quand la page est diffusée en flux), jamais l'éditeur.
  await employe.goto(`/app/documents/rediger/${idDocument}`);
  await expect(employe.getByText("This page could not be found")).toBeVisible({ timeout: 60_000 });
  await expect(employe.locator(".editeur-contenu")).toHaveCount(0);
  await expect(employe.locator("#titre-document")).toHaveCount(0);
});

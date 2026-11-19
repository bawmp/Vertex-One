import { test, expect } from "@playwright/test";
import { MOT_DE_PASSE } from "./aide-equipe";
import { supprimerEntrepriseDeTest } from "../tests/aide-nettoyage";
import { ajouterJours, aujourdhuiDouala } from "../src/lib/facturation/promesse-regles";

// Prospects qualifiés : un lead qualifié quitte la liste des Leads et arrive dans « Prospects qualifiés » (jamais dans les Contacts) ; on le relance par WhatsApp
// (la conversation s'ouvre avec le message prêt), on note un appel, on fixe un rappel, puis « Devenir client » le fait seulement alors entrer dans les Contacts.
// Aucun e-mail réel n'est envoyé ici : l'onglet e-mail est vérifié (modèle, garde « [à compléter] ») sans appuyer sur « Envoyer ».
const ATTENTE = { timeout: 60_000 };
let nomEntreprise = "";

test.afterAll(async () => {
  if (nomEntreprise) await supprimerEntrepriseDeTest(nomEntreprise);
});

test("Prospects qualifiés : de lead qualifié à client, avec relances", async ({ page, context }) => {
  test.setTimeout(500_000);
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  nomEntreprise = `TEST prospects ${suffixe}`;
  await page.goto("/inscription");
  await page.fill("#nomEntreprise", nomEntreprise);
  await page.getByRole("radio", { name: "Agence" }).click();
  await page.fill("#nomComplet", "Alice Admin");
  await page.fill("#email", `prospects-admin-${suffixe}@vertexone.test`);
  await page.fill("#motDePasse", MOT_DE_PASSE);
  await page.click('button[type="submit"]');
  await page.waitForURL("/app", { timeout: 120_000 });

  // WhatsApp ne doit jamais être joint pour de bon pendant le test : l'adresse wa.me est interceptée.
  await context.route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>WhatsApp (simulé)</body></html>" }));

  // ===== Un lead est créé : il est dans « Leads », pas dans « Prospects qualifiés » =====
  await page.goto("/app/leads/nouveau");
  await page.fill("#nom", "Jean Mbarga");
  await page.fill("#societeCliente", "Garage Mbarga");
  await page.fill("#telephone", "690 11 12 22");
  await page.fill("#email", `jean-${suffixe}@client.test`);
  await page.getByRole("button", { name: /Créer|Enregistrer/ }).first().click();
  await page.waitForURL(/\/app\/leads\/[^/]+$/, ATTENTE);
  await expect(page.getByRole("heading", { name: "Jean Mbarga" })).toBeVisible(ATTENTE);

  await page.goto("/app/prospects");
  await expect(page.getByText("Aucun prospect qualifié pour le moment.")).toBeVisible(ATTENTE);

  // ===== Il est qualifié : il quitte « Leads » et arrive dans « Prospects qualifiés » =====
  await page.goto("/app/leads");
  await page.getByRole("link", { name: /Jean Mbarga/ }).click();
  await page.getByRole("button", { name: "Qualifié", exact: true }).click();
  await expect(page.getByText("Jamais relancé").first()).toBeVisible(ATTENTE);

  await page.goto("/app/leads");
  await expect(page.getByText("Aucun lead pour le moment.")).toBeVisible(ATTENTE);
  await expect(page.getByText(/1 prospect qualifié à relancer/)).toBeVisible(ATTENTE);

  await page.getByRole("link", { name: /prospect qualifié à relancer/ }).click();
  await expect(page.getByRole("heading", { name: "Prospects qualifiés" })).toBeVisible(ATTENTE);
  const ligne = page.locator("div.flex.flex-col.gap-3.px-4.py-3", { hasText: "Jean Mbarga" });
  await expect(ligne).toBeVisible(ATTENTE);
  await expect(ligne.getByText("Jamais relancé").first()).toBeVisible(ATTENTE);

  // Il n'est PAS dans les Contacts.
  await page.goto("/app/contacts");
  await expect(page.getByText("Jean Mbarga")).toHaveCount(0);

  // ===== E-mail : un modèle remplit l'objet et le message ; un élément « [à compléter] » bloque l'envoi =====
  await page.goto("/app/prospects");
  await ligne.getByRole("button", { name: "E-mail", exact: true }).click();
  await page.getByLabel("Modèle (facultatif)").selectOption({ label: "Prise de nouvelles" });
  await expect(page.getByLabel("Objet")).toHaveValue("Suite à notre échange");
  await expect(page.getByLabel("Message").first()).toHaveValue(/Bonjour Jean Mbarga/);
  await expect(page.getByLabel("Message").first()).toHaveValue(new RegExp(nomEntreprise));
  await page.getByLabel("Message").first().fill("Bonjour, voici le lien : [lien de suivi]");
  await expect(page.getByText(/Complétez ou retirez/)).toBeVisible(ATTENTE);
  await expect(page.getByRole("button", { name: "Envoyer l'e-mail" })).toBeDisabled();

  // ===== WhatsApp : la conversation s'ouvre avec le message prêt, la relance est notée =====
  await ligne.getByRole("button", { name: "WhatsApp", exact: true }).click();
  await page.getByLabel("Modèle (facultatif)").selectOption({ label: "Proposer un rendez-vous" });
  await expect(page.locator("textarea").first()).toHaveValue(/Bonjour Jean Mbarga, c'est/);
  const [popup] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "Ouvrir WhatsApp" }).click()]);
  // La fenêtre s'ouvre tout de suite sur « about:blank » (pour ne pas être bloquée), puis le serveur répond et la mène vers wa.me.
  await popup.waitForURL(/^https:\/\/wa\.me\//, ATTENTE);
  expect(popup.url()).toMatch(/^https:\/\/wa\.me\/237690111222\?text=Bonjour%20Jean%20Mbarga/);
  await expect(page.getByText("WhatsApp est ouvert.")).toBeVisible(ATTENTE);
  await popup.close();

  // Après la relance, le prospect est « Relancé récemment ».
  await page.goto("/app/prospects");
  await expect(ligne.getByText("Relancé récemment")).toBeVisible(ATTENTE);

  // ===== Fiche : historique, appel noté, rappel =====
  await ligne.getByRole("link", { name: "Jean Mbarga" }).click();
  await expect(page.getByText("Historique des relances")).toBeVisible(ATTENTE);
  await expect(page.getByText(/Bonjour Jean Mbarga, c'est/).first()).toBeVisible(ATTENTE);
  await page.getByRole("tab", { name: "Appel / note" }).click();
  await page.getByLabel("Ce qui s'est dit").fill("Appelé : veut un devis pour 3 véhicules.");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Noté dans l'historique.")).toBeVisible(ATTENTE);
  await expect(page.getByText("Appelé : veut un devis pour 3 véhicules.")).toBeVisible(ATTENTE);

  await page.getByRole("tab", { name: "Rappel" }).click();
  await page.getByLabel("Me le rappeler le").fill(ajouterJours(aujourdhuiDouala(), 3));
  await page.getByRole("button", { name: "Enregistrer le rappel" }).click();
  await expect(page.getByText(/Rappel enregistré/)).toBeVisible(ATTENTE);
  await page.goto("/app/prospects");
  await expect(ligne.getByText("Rappel prévu").first()).toBeVisible(ATTENTE);

  // ===== Devenir client : deux temps, puis le contact existe et le prospect a quitté la liste =====
  await ligne.getByRole("button", { name: "Devenir client" }).click();
  await expect(ligne.getByText("Créer le contact ?")).toBeVisible(ATTENTE);
  await ligne.getByRole("button", { name: "Non" }).click();
  await expect(ligne.getByRole("button", { name: "Devenir client" })).toBeVisible(ATTENTE);
  await page.goto("/app/contacts");
  await expect(page.getByText("Jean Mbarga")).toHaveCount(0); // « Non » n'a rien créé

  await page.goto("/app/prospects");
  await ligne.getByRole("button", { name: "Devenir client" }).click();
  await ligne.getByRole("button", { name: "Oui", exact: true }).click();
  await page.waitForURL(/\/app\/contacts\/[^/]+$/, ATTENTE);
  await expect(page.getByRole("heading", { name: /Jean Mbarga/ })).toBeVisible(ATTENTE);

  await page.goto("/app/prospects");
  await expect(page.getByText("Aucun prospect qualifié pour le moment.")).toBeVisible(ATTENTE);
  await page.goto("/app/contacts");
  await expect(page.getByText("Jean Mbarga").first()).toBeVisible(ATTENTE);
});

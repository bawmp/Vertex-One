import { test, expect } from "@playwright/test";
import { creerEquipe, supprimerEntrepriseDeTest, type Equipe } from "./aide-equipe";

// Import de données depuis Zoho / Asana : contacts (simulation puis import réel), tâches Asana, factures historiques
// Zoho Books ; un Employé ne se voit pas proposer les finances.
const CSV_CONTACTS = ["First Name,Last Name,Account Name,Email,Phone", "Jean,Dupont,Société Alpha,jean@alpha.cm,690 11 12 22", "Marie,Nguema,Société Alpha,marie@alpha.cm,677 00 00 01", "Paul,Fotso,,paul@fotso.cm,655 00 00 09"].join("\n");

const CSV_ASANA = [
  "Task ID,Created At,Completed At,Name,Section/Column,Assignee,Assignee Email,Start Date,Due Date,Notes,Projects,Parent task",
  "1,2026-01-01,2026-02-01,Maquette du site,Done,,,2026-01-05,2026-02-01,,Refonte du site vitrine,",
  "2,2026-01-02,,Développement,In progress,,,2026-02-02,2026-03-15,,Refonte du site vitrine,",
].join("\n");

const CSV_FACTURES = [
  "Invoice Date,Invoice Number,Invoice Status,Customer Name,Due Date,Item Name,Quantity,Item Price,Item Tax %",
  "2025-11-05,INV-000101,Paid,Client Historique SA,2025-12-05,Site vitrine,1,200000,19.25",
  "2025-11-05,INV-000101,Paid,Client Historique SA,2025-12-05,Hébergement,2,15000,19.25",
  "2025-12-01,INV-000102,Sent,Société Alpha,2025-12-31,Maintenance,1,50000,0",
].join("\n");

let equipe: Equipe | undefined;
let nomEntreprise = "";

test.afterAll(async () => {
  await equipe?.contexteEmploye.close();
  if (nomEntreprise) await supprimerEntrepriseDeTest(nomEntreprise);
});

test("import de données : contacts, tâches Asana, factures Zoho Books", async ({ page: alice, browser }) => {
  test.setTimeout(900_000);
  equipe = await creerEquipe(alice, browser, "import");
  nomEntreprise = equipe.nomEntreprise;

  async function choisirEtAnalyser(libelle: string, nom: string, contenu: string) {
    await alice.goto("/app/parametres/import");
    await alice.getByRole("button", { name: libelle }).click();
    await alice.locator("#fichier-import").setInputFiles({ name: nom, mimeType: "text/csv", buffer: Buffer.from(contenu) });
    await alice.getByRole("button", { name: "Analyser le fichier" }).click();
    await expect(alice.getByRole("heading", { name: /Associer les colonnes/ })).toBeVisible({ timeout: 90_000 });
  }

  // ===== Contacts : association automatique, simulation sans effet, puis import réel =====
  await choisirEtAnalyser("Contacts et entreprises clientes", "contacts-zoho.csv", CSV_CONTACTS);
  await expect(alice.getByLabel("Nom", { exact: true })).toHaveValue("Last Name");
  await expect(alice.getByLabel("Société", { exact: true })).toHaveValue("Account Name");
  await alice.getByRole("button", { name: "Simuler l'import" }).click();
  await expect(alice.getByText("rien n'a encore été enregistré")).toBeVisible({ timeout: 90_000 });
  await expect(alice.getByText("seront créés")).toBeVisible();

  await alice.goto("/app/contacts");
  await expect(alice.getByText("Jean Dupont")).toHaveCount(0); // la simulation n'a rien écrit

  await choisirEtAnalyser("Contacts et entreprises clientes", "contacts-zoho.csv", CSV_CONTACTS);
  await alice.getByRole("button", { name: "Simuler l'import" }).click();
  await alice.getByRole("button", { name: /Importer pour de bon \(3\)/ }).click();
  await expect(alice.getByText("Import terminé")).toBeVisible({ timeout: 90_000 });
  await alice.goto("/app/contacts");
  await expect(alice.getByText("Jean Dupont")).toBeVisible();
  await expect(alice.getByText("Paul Fotso")).toBeVisible();

  // Rejouer le même fichier : tout est reconnu comme déjà présent.
  await choisirEtAnalyser("Contacts et entreprises clientes", "contacts-zoho.csv", CSV_CONTACTS);
  await alice.getByRole("button", { name: "Simuler l'import" }).click();
  await expect(alice.getByText("ignorés (déjà présents)")).toBeVisible({ timeout: 90_000 });
  await expect(alice.getByRole("button", { name: /Importer pour de bon \(0\)/ })).toBeDisabled();

  // ===== Tâches Asana =====
  await choisirEtAnalyser("Projets et tâches", "asana.csv", CSV_ASANA);
  await expect(alice.getByLabel("Titre de la tâche")).toHaveValue("Name");
  await expect(alice.getByLabel("Projet", { exact: true })).toHaveValue("Projects");
  await alice.getByRole("button", { name: "Simuler l'import" }).click();
  await alice.getByRole("button", { name: /Importer pour de bon \(2\)/ }).click();
  await expect(alice.getByText("Import terminé")).toBeVisible({ timeout: 90_000 });
  await alice.goto("/app/projets"); // liste des dossiers clients : les projets importés vivent dans le dossier du client interne
  await alice.getByText("Dossier Projets importés").click();
  await expect(alice.getByText("Refonte du site vitrine")).toBeVisible({ timeout: 60_000 });

  // ===== Factures historiques Zoho Books =====
  await choisirEtAnalyser("Factures historiques", "factures-zoho.csv", CSV_FACTURES);
  await expect(alice.getByLabel("Numéro de facture")).toHaveValue("Invoice Number");
  await alice.getByRole("button", { name: "Simuler l'import" }).click();
  await alice.getByRole("button", { name: /Importer pour de bon \(2\)/ }).click();
  await expect(alice.getByText("Import terminé")).toBeVisible({ timeout: 90_000 });
  await alice.goto("/app/facturation");
  await expect(alice.getByText("INV-000101").first()).toBeVisible();
  await expect(alice.getByText("INV-000102").first()).toBeVisible();

  // ===== Un Employé n'importe pas les finances ni les notes privées =====
  const bob = equipe.employe;
  await bob.goto("/app/parametres/import");
  await expect(bob.getByRole("heading", { name: "Importer des données" })).toBeVisible({ timeout: 90_000 });
  await expect(bob.getByRole("button", { name: "Factures historiques" })).toHaveCount(0);
  await expect(bob.getByRole("button", { name: "Devis historiques" })).toHaveCount(0);
  await expect(bob.getByRole("button", { name: "Notes personnelles" })).toHaveCount(0);
});

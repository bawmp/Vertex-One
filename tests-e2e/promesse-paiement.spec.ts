import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { MOT_DE_PASSE } from "./aide-equipe";
import { supprimerEntrepriseDeTest } from "../tests/aide-nettoyage";
import { avecEntreprise, db } from "../src/db/client";
import { contact, entreprise, facture, utilisateur } from "../src/db/schema";
import { obtenirOuCreerLien } from "../src/lib/client-documents/liens";
import { ajouterJours, aujourdhuiDouala } from "../src/lib/facturation/promesse-regles";

// Promesse de paiement : l'équipe la note depuis la fiche de la facture (badge dans la liste, encart de suivi, retrait), puis le
// client en déclare une depuis sa page publique (« Payer plus tard » → « Je paierai le… »), que l'équipe retrouve sur la fiche.
const ATTENTE = { timeout: 60_000 };
let nomEntreprise = "";

test.afterAll(async () => {
  if (nomEntreprise) await supprimerEntrepriseDeTest(nomEntreprise);
});

test("Promesse de paiement : notée par l'équipe, puis déclarée par le client", async ({ page, browser }) => {
  test.setTimeout(500_000);
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  nomEntreprise = `TEST promesse ${suffixe}`;
  const emailAdmin = `promesse-admin-${suffixe}@vertexone.test`;
  await page.goto("/inscription");
  await page.fill("#nomEntreprise", nomEntreprise);
  await page.getByRole("radio", { name: "Agence" }).click();
  await page.fill("#nomComplet", "Alice Admin");
  await page.fill("#email", emailAdmin);
  await page.fill("#motDePasse", MOT_DE_PASSE);
  await page.click('button[type="submit"]');
  await page.waitForURL("/app", { timeout: 120_000 });

  // Une facture émise (en retard) et son lien public, créés directement en base pour le test.
  const [{ id: entrepriseId }] = await db.select({ id: entreprise.id }).from(entreprise).where(eq(entreprise.nom, nomEntreprise));
  const [{ id: adminId }] = await db.select({ id: utilisateur.id }).from(utilisateur).where(eq(utilisateur.email, emailAdmin));
  const { factureId, jeton } = await avecEntreprise(entrepriseId, async (tx) => {
    const [c] = await tx.insert(contact).values({ entrepriseId, nom: "Jean Mbarga", telephone: "690111222", assigneAId: adminId }).returning({ id: contact.id });
    const [fac] = await tx
      .insert(facture)
      .values({ entrepriseId, numero: `FAC-${suffixe}`, contactId: c.id, assigneAId: adminId, montantHT: 120000, montantTVA: 0, montantTTC: 120000, dateEcheance: new Date(Date.now() - 5 * 86_400_000) })
      .returning({ id: facture.id });
    return { factureId: fac.id, jeton: await obtenirOuCreerLien(tx, entrepriseId, { factureId: fac.id }) };
  });

  // ===== Équipe : noter une promesse =====
  await page.goto(`/app/facturation/factures/${factureId}`);
  await expect(page.getByText("Aucune promesse en cours.", { exact: false })).toBeVisible(ATTENTE);
  await page.getByRole("button", { name: "Noter une promesse" }).click();
  const formulaire = page.getByRole("form", { name: "Noter une promesse de paiement" });
  await formulaire.getByLabel("Le client paiera le").fill(ajouterJours(aujourdhuiDouala(), 3));
  await formulaire.getByLabel("Montant promis (FCFA)").fill("120000");
  await formulaire.getByLabel("Comment l'a-t-il annoncé ?").selectOption("whatsapp");
  await formulaire.getByLabel("Note (facultatif)").fill("Attend son virement");
  await formulaire.getByRole("button", { name: "Enregistrer la promesse" }).click();
  await expect(page.getByText("Promesse en cours", { exact: true })).toBeVisible(ATTENTE);
  await expect(page.getByText(/attendus le/)).toBeVisible(ATTENTE);
  await expect(page.getByText("« Attend son virement »")).toBeVisible(ATTENTE);
  await expect(page.getByText("Les relances automatiques de cette facture sont suspendues", { exact: false })).toBeVisible(ATTENTE);

  // Une date passée est refusée avec un message.
  await page.getByRole("button", { name: "Noter une nouvelle date" }).click();
  const second = page.getByRole("form", { name: "Noter une promesse de paiement" });
  await second.getByLabel("Le client paiera le").evaluate((el: HTMLInputElement, jour) => { el.removeAttribute("min"); el.value = jour; el.dispatchEvent(new Event("input", { bubbles: true })); }, ajouterJours(aujourdhuiDouala(), -2));
  await second.getByRole("button", { name: "Enregistrer la promesse" }).click();
  await expect(page.getByText("La date promise ne peut pas être dans le passé.")).toBeVisible(ATTENTE);
  await second.getByRole("button", { name: "Annuler" }).click();

  // ===== Liste des factures : badge « Promis le » et encart de suivi =====
  await page.goto("/app/facturation");
  await expect(page.getByText("Promesses de paiement attendues cette semaine")).toBeVisible(ATTENTE);
  await expect(page.getByText(/Promis le/).first()).toBeVisible(ATTENTE);

  // ===== Retrait =====
  await page.goto(`/app/facturation/factures/${factureId}`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Retirer la promesse" }).click();
  await expect(page.getByText("Aucune promesse en cours.", { exact: false })).toBeVisible(ATTENTE);

  // ===== Client : « Payer plus tard » → « Je paierai le… » (aucune session) =====
  const contexteClient = await browser.newContext();
  const client = await contexteClient.newPage();
  await client.goto(`/facture/${jeton}`);
  await client.getByRole("button", { name: /Accepter la facture/ }).click();
  await client.getByRole("button", { name: /Payer plus tard/ }).click({ timeout: 90_000 });
  await client.getByLabel("Je paierai le").fill(ajouterJours(aujourdhuiDouala(), 5));
  await client.getByLabel(/Un mot pour/).fill("Je reçois mon salaire le 5");
  await client.getByRole("button", { name: "Confirmer cette date" }).click();
  await expect(client.getByText(/vous avez annoncé que vous réglerez/)).toBeVisible(ATTENTE);
  await expect(client.getByRole("button", { name: "Changer la date" })).toBeVisible();

  // ===== Équipe : la promesse du client apparaît sur la fiche =====
  await page.goto(`/app/facturation/factures/${factureId}`);
  await expect(page.getByText("Déclarée par le client depuis sa page de facture.")).toBeVisible(ATTENTE);
  await expect(page.getByText("« Je reçois mon salaire le 5 »")).toBeVisible(ATTENTE);
  await contexteClient.close();
});

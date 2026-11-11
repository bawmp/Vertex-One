import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { MOT_DE_PASSE } from "./aide-equipe";
import { supprimerEntrepriseDeTest } from "../tests/aide-nettoyage";
import { avecEntreprise, db } from "../src/db/client";
import { contact, entreprise, utilisateur } from "../src/db/schema";

// Modèle de message « profil dans le bassin » : sur la fiche d'un contact, le formulaire « Écrire à… » propose le modèle, préremplit le nom
// du client et de l'entreprise, et REFUSE l'envoi tant qu'il reste des éléments entre crochets. Aucun email n'est envoyé dans ce test.
const CAPTURES = process.env.CAPTURES_MODELE ?? "";
let nomEntreprise = "";

test.afterAll(async () => {
  if (nomEntreprise) await supprimerEntrepriseDeTest(nomEntreprise);
});

test("Écrire à un client avec le modèle « profil dans le bassin »", async ({ page }) => {
  test.setTimeout(300_000);
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  nomEntreprise = `TEST modele message ${suffixe}`;
  const emailAdmin = `modele-admin-${suffixe}@vertexone.test`;
  await page.goto("/inscription");
  await page.fill("#nomEntreprise", nomEntreprise);
  await page.getByRole("radio", { name: "Agence" }).click();
  await page.fill("#nomComplet", "Alice Admin");
  await page.fill("#email", emailAdmin);
  await page.fill("#motDePasse", MOT_DE_PASSE);
  await page.click('button[type="submit"]');
  await page.waitForURL("/app", { timeout: 90_000 });

  const [{ id: entrepriseId }] = await db.select({ id: entreprise.id }).from(entreprise).where(eq(entreprise.nom, nomEntreprise));
  const [{ id: adminId }] = await db.select({ id: utilisateur.id }).from(utilisateur).where(eq(utilisateur.email, emailAdmin));
  const contactId = await avecEntreprise(entrepriseId, async (tx) => {
    const [c] = await tx.insert(contact).values({ entrepriseId, nom: "Linda Mbella", telephone: "690111222", email: "linda@exemple.test", assigneAId: adminId }).returning({ id: contact.id });
    return c.id;
  });

  await page.goto(`/app/contacts/${contactId}`);
  await page.locator("#ecrire-au-client summary").click({ timeout: 90_000 });

  // Avant le modèle : champs vides, aucun avertissement.
  await expect(page.locator(`#objet-${contactId}`)).toHaveValue("");
  await expect(page.getByRole("status").filter({ hasText: "crochets" })).toHaveCount(0);

  await page.locator(`#modele-${contactId}`).selectOption({ label: "Profil dans le bassin (conjointe de fait)" });
  await expect(page.locator(`#objet-${contactId}`)).toHaveValue("Votre dossier est maintenant dans le bassin Entrée express");
  const message = page.locator(`#message-${contactId}`);
  await expect(message).toHaveValue(/Bonjour Linda Mbella,/);
  await expect(message).toHaveValue(new RegExp(`${nomEntreprise}\\s*$`)); // signature : le nom de l'entreprise
  await expect(message).not.toHaveValue(/\{\{/);

  // Des éléments entre crochets restent : l'avertissement les nomme et l'envoi est bloqué.
  const alerte = page.getByRole("status").filter({ hasText: "crochets" });
  await expect(alerte).toContainText("[prénom du conjoint]");
  await expect(alerte).toContainText("[lien de suivi]");
  const envoyer = page.getByRole("button", { name: "Envoyer l'email" });
  await expect(envoyer).toBeDisabled();
  if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/1-modele-choisi.png`, fullPage: true });

  // Une fois remplacés, l'avertissement disparaît et l'envoi se débloque (on n'envoie pas).
  const rempli = (await message.inputValue()).replaceAll("[prénom du conjoint]", "Marc").replaceAll("[lien de suivi]", "https://exemple.test/suivi/abc");
  await message.fill(rempli);
  await expect(alerte).toHaveCount(0);
  await expect(envoyer).toBeEnabled();
  if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/2-pret-a-envoyer.png`, fullPage: true });

  // ===== Pièces jointes (aucun envoi) =====
  const entree = page.locator('input[name="fichiers"]');
  const liste = page.getByRole("list", { name: "Pièces jointes de l'email" });
  const pdf = (nom: string) => ({ name: nom, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") });
  await entree.setInputFiles([pdf("devis.pdf"), pdf("plan.pdf")]);
  await expect(liste).toContainText("devis.pdf");
  await expect(liste).toContainText("plan.pdf");
  await expect(envoyer).toBeEnabled();
  if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/3-pieces-jointes.png`, fullPage: true });

  // Retirer un fichier le fait disparaître de la liste.
  await liste.getByRole("button", { name: "Retirer plan.pdf" }).click();
  await expect(liste).not.toContainText("plan.pdf");
  await expect(liste).toContainText("devis.pdf");

  // Au-delà de cinq fichiers : message d'erreur et envoi bloqué.
  await entree.setInputFiles(["a", "b", "c", "d", "e"].map((x) => pdf(`piece-${x}.pdf`)));
  await expect(page.getByRole("alert").filter({ hasText: "5 pièces jointes" })).toBeVisible();
  await expect(envoyer).toBeDisabled();
  if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/4-trop-de-fichiers.png`, fullPage: true });
});

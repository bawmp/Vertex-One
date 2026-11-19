import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { MOT_DE_PASSE } from "./aide-equipe";
import { supprimerEntrepriseDeTest } from "../tests/aide-nettoyage";
import { avecEntreprise, db } from "../src/db/client";
import { entreprise, lead, utilisateur } from "../src/db/schema";

// Relance automatique et envoi groupé : les réglages (activation, aperçu de ce qui partirait, validation des délais), l'état de la séquence sur chaque prospect,
// « Il a répondu » / « Reprendre », la sélection et le composeur groupé. AUCUN e-mail n'est envoyé ici : le composeur est vérifié (modèle, repères, garde
// « [à compléter] ») sans appuyer sur « Envoyer », et la tâche planifiée n'est pas lancée.
const ATTENTE = { timeout: 60_000 };
let nomEntreprise = "";

test.afterAll(async () => {
  if (nomEntreprise) await supprimerEntrepriseDeTest(nomEntreprise);
});

test("Relance automatique et envoi groupé : réglages, état, arrêt/reprise, sélection", async ({ page }) => {
  test.setTimeout(500_000);
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  nomEntreprise = `TEST sequence ${suffixe}`;
  const email = `sequence-admin-${suffixe}@vertexone.test`;
  await page.goto("/inscription");
  await page.fill("#nomEntreprise", nomEntreprise);
  await page.getByRole("radio", { name: "Agence" }).click();
  await page.fill("#nomComplet", "Alice Admin");
  await page.fill("#email", email);
  await page.fill("#motDePasse", MOT_DE_PASSE);
  await page.click('button[type="submit"]');
  await page.waitForURL("/app", { timeout: 120_000 });

  // Deux prospects qualifiés depuis 10 jours (leur premier e-mail serait dû) créés directement en base.
  const [{ id: entrepriseId }] = await db.select({ id: entreprise.id }).from(entreprise).where(eq(entreprise.nom, nomEntreprise));
  const [{ id: adminId }] = await db.select({ id: utilisateur.id }).from(utilisateur).where(eq(utilisateur.email, email));
  const qualifie = new Date(Date.now() - 10 * 86_400_000);
  await avecEntreprise(entrepriseId, async (tx) => {
    const base = { entrepriseId, statut: "QUALIFIE" as const, assigneAId: adminId, qualifieLe: qualifie };
    await tx.insert(lead).values({ ...base, nom: "Jean Mbarga", telephone: "690 11 12 22", email: "jean@garage-mbarga.cm" });
    await tx.insert(lead).values({ ...base, nom: "Marie Nkoulou", telephone: "677 45 67 89", email: "marie@exemple.cm" });
  });

  // ===== Réglages : désactivée par défaut, avec l'aperçu de ce qui partirait =====
  await page.goto("/app/parametres/relance-prospects");
  await expect(page.getByRole("heading", { name: /Relance automatique des prospects/ })).toBeVisible(ATTENTE);
  await expect(page.getByText("Désactivée", { exact: true }).first()).toBeVisible(ATTENTE);
  await expect(page.getByText("Ce qui partirait si vous l'activiez")).toBeVisible(ATTENTE);
  await expect(page.getByText(/2 e-mails partiraient au prochain passage/)).toBeVisible(ATTENTE);
  await expect(page.getByText("Les garde-fous")).toBeVisible(ATTENTE);

  // Délais invalides refusés avec un message ; plafond invalide aussi.
  await page.getByLabel("Jours d'envoi après la qualification").fill("7, 3");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText(/Délais invalides/)).toBeVisible(ATTENTE);
  await page.getByLabel("Jours d'envoi après la qualification").fill("2, 5");
  await page.getByLabel("Plafond d'e-mails automatiques par jour").fill("0");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText(/plafond par jour doit être/)).toBeVisible(ATTENTE);

  // Réglages valides : activer.
  await page.getByLabel("Plafond d'e-mails automatiques par jour").fill("10");
  await page.getByLabel("Activer la relance automatique des prospects qualifiés").check();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Réglages enregistrés.")).toBeVisible(ATTENTE);
  await page.reload();
  await expect(page.getByText("Activée", { exact: true }).first()).toBeVisible(ATTENTE);
  await expect(page.getByLabel("Jours d'envoi après la qualification")).toHaveValue("2, 5");
  await expect(page.getByText("Au prochain passage", { exact: true })).toBeVisible(ATTENTE);
  await page.getByText(/Étape 1 — Prise de nouvelles/).click(); // les messages envoyés sont visibles et contiennent les repères
  await expect(page.getByText(/Bonjour \{nom\},/).first()).toBeVisible(ATTENTE);

  // ===== Prospects : l'état de la séquence apparaît sur chaque prospect =====
  await page.goto("/app/prospects");
  await expect(page.getByText("Relance automatique : activée")).toBeVisible(ATTENTE);
  const ligne = page.locator("div.flex.flex-col.gap-3.px-4.py-3", { hasText: "Jean Mbarga" });
  await expect(ligne.getByText("Prochain e-mail automatique : aujourd'hui (étape 1 sur 2)")).toBeVisible(ATTENTE);

  // « Il a répondu » arrête la séquence ; « Reprendre » la relance.
  await ligne.getByRole("button", { name: "Plus d'options de relance" }).click();
  await page.getByRole("tab", { name: "Automatique" }).click();
  await page.getByRole("button", { name: "Il a répondu" }).click();
  await expect(page.getByText("C'est noté : les relances automatiques sont arrêtées.")).toBeVisible(ATTENTE);
  await expect(ligne.getByText("Relance automatique arrêtée : il a répondu").first()).toBeVisible(ATTENTE);
  await page.getByRole("tab", { name: "Automatique" }).click();
  await page.getByRole("button", { name: "Reprendre les relances automatiques" }).click();
  await expect(page.getByText("Les relances automatiques reprennent.")).toBeVisible(ATTENTE);
  // Les notes écrites par le système (« il a répondu », « reprise ») ne sont pas des relances : le prochain e-mail redevient dû aujourd'hui.
  await expect(ligne.getByText("Prochain e-mail automatique : aujourd'hui (étape 1 sur 2)").first()).toBeVisible(ATTENTE);

  // La fiche du lead montre ces deux notes dans l'historique.
  await ligne.getByRole("link", { name: "Jean Mbarga" }).click();
  await expect(page.getByText("Historique des relances")).toBeVisible(ATTENTE);
  await expect(page.getByText("Le prospect a répondu : les relances automatiques sont arrêtées.")).toBeVisible(ATTENTE);
  await expect(page.getByText("Les relances automatiques de ce prospect reprennent.")).toBeVisible(ATTENTE);

  // ===== Envoi groupé : sélection, composeur, garde « [à compléter] » (aucun envoi) =====
  await page.goto("/app/prospects");
  await page.getByLabel("Tout sélectionner").check();
  await expect(page.getByText("2 prospects sélectionnés")).toBeVisible(ATTENTE);
  await page.getByRole("button", { name: "Écrire par e-mail à la sélection" }).click();
  await expect(page.getByRole("heading", { name: "Écrire à 2 prospects" })).toBeVisible(ATTENTE);
  await page.getByLabel("Modèle (facultatif)").selectOption({ label: "Prise de nouvelles" });
  await expect(page.getByLabel("Objet")).toHaveValue("Suite à notre échange");
  await expect(page.getByLabel("Message")).toHaveValue(/Bonjour \{nom\},/); // les repères restent écrits : le serveur les remplace pour CHAQUE destinataire
  await page.getByLabel("Message").fill("Bonjour {nom}, voici le lien : [lien de suivi]");
  await expect(page.getByText(/Complétez ou retirez/)).toBeVisible(ATTENTE);
  await expect(page.getByRole("button", { name: "Envoyer à 2 prospects" })).toBeDisabled();
  await page.getByLabel("Message").fill("Bonjour {nom}, un message de groupe.");
  await expect(page.getByRole("button", { name: "Envoyer à 2 prospects" })).toBeEnabled();

  // Décocher un prospect met la sélection à jour ; effacer la sélection ferme le composeur.
  await page.getByRole("button", { name: "Effacer la sélection" }).click();
  await expect(page.getByRole("heading", { name: /Écrire à/ })).toHaveCount(0);
  await page.getByLabel("Sélectionner Marie Nkoulou").check();
  await expect(page.getByText("1 prospect sélectionné")).toBeVisible(ATTENTE);
});

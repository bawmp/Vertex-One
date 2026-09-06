import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "../src/db/client";
import {
  entreprise,
  utilisateur,
  compte,
  session,
  prospect,
  devis,
  ligneDevis,
  facture,
  ligneFacture,
  dossier,
  projet,
  tache,
  commentaire,
} from "../src/db/schema";

// Parcours critique Palier 2 : un devis accepté ouvre automatiquement un
// Dossier (ou réutilise celui existant) et un Projet — voir docs/palier-2-*,
// section 3. Vérifie ensuite la fiche Dossier, la fiche Projet, l'ajout et
// l'achèvement d'une tâche, dans un vrai navigateur contre la vraie base.
const emailAdmin = `e2e-p2-${Date.now()}@vertexone.test`;
const motDePasse = "mot-de-passe-test-12345";

let entrepriseId: string;

test.afterAll(async () => {
  if (!entrepriseId) return;
  await avecEntreprise(entrepriseId, async (tx) => {
    await tx.delete(commentaire).where(eq(commentaire.entrepriseId, entrepriseId));
    await tx.delete(tache).where(eq(tache.entrepriseId, entrepriseId));
    await tx.delete(projet).where(eq(projet.entrepriseId, entrepriseId));
    await tx.delete(dossier).where(eq(dossier.entrepriseId, entrepriseId));
    await tx.delete(ligneFacture).where(eq(ligneFacture.entrepriseId, entrepriseId));
    await tx.delete(facture).where(eq(facture.entrepriseId, entrepriseId));
    await tx.delete(ligneDevis).where(eq(ligneDevis.entrepriseId, entrepriseId));
    await tx.delete(devis).where(eq(devis.entrepriseId, entrepriseId));
    await tx.delete(prospect).where(eq(prospect.entrepriseId, entrepriseId));
  });

  const [u] = await db.select().from(utilisateur).where(eq(utilisateur.email, emailAdmin));
  if (u) {
    await db.delete(session).where(eq(session.userId, u.id));
    await db.delete(compte).where(eq(compte.userId, u.id));
    await db.delete(utilisateur).where(eq(utilisateur.id, u.id));
  }
  await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
});

test("devis accepté → Dossier + Projet automatiques → tâche créée et achevée", async ({ page }) => {
  // Parcours long (inscription, devis, acceptation, dossier, projet, tâche,
  // commentaire — 8+ Server Actions réelles) ; 150s s'est révélé
  // insuffisant sous la latence Neon constatée en pratique lors des
  // premiers runs (voir CLAUDE.md, latence Neon).
  test.setTimeout(220_000);

  await page.goto("/inscription");
  await page.fill("#nomEntreprise", "TEST E2E Palier 2");
  await page.selectOption("#secteurProfil", "cabinet"); // vocabulaire "Mission" attendu
  await page.fill("#nomComplet", "Admin E2E");
  await page.fill("#email", emailAdmin);
  await page.fill("#motDePasse", motDePasse);
  await page.click('button[type="submit"]');
  await page.waitForURL("/app");

  const [admin] = await db.select().from(utilisateur).where(eq(utilisateur.email, emailAdmin));
  entrepriseId = admin.entrepriseId;

  // Dossiers/Projets sont verrouillés à partir du forfait Pro (docs/palier-2-*,
  // section 6) — une entreprise fraîchement créée est "starter" par défaut,
  // pas de parcours d'upgrade dans l'UI à ce stade du produit, donc mise à
  // niveau directe en base comme pour les autres raccourcis de test déjà
  // établis dans cette suite (ex. forcer un devis à ENVOYE plus bas).
  await db.update(entreprise).set({ planAbonnement: "pro" }).where(eq(entreprise.id, entrepriseId));

  await page.goto("/app/parametres/entreprise");
  await page.fill("#niu", "M012345678901X");
  await page.fill("#rccm", "RC/DLA/2026/B/1234");
  await page.click('button[type="submit"]');
  await page.waitForURL("/app/crm");

  await page.goto("/app/crm/nouveau");
  await page.fill("#nom", "Cabinet Fidèle");
  await page.fill("#telephone", "+237600000099");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app\/crm\/.+/);

  await page.click('a:has-text("Créer un devis")');
  await page.waitForURL(/\/app\/facturation\/devis\/nouveau/);
  await page.fill('input[name="dateValidite"]', "2026-12-31");
  await page.fill('input[name="designation"]', "Prestation de conseil");
  await page.fill('input[name="quantite"]', "1");
  await page.fill('input[name="prixUnitaire"]', "100000");
  await page.click('button:has-text("Créer le devis")');
  await page.waitForURL(/\/app\/facturation\/devis\/(?!nouveau)/);

  // Contourne l'envoi réel (Resend rejette en sandbox — voir
  // palier-1-crm-facturation.spec.ts) pour atteindre le statut ENVOYE,
  // préalable à l'acceptation.
  const idDevis = page.url().split("/").pop()!;
  await avecEntreprise(entrepriseId, (tx) => tx.update(devis).set({ statut: "ENVOYE" }).where(eq(devis.id, idDevis)));
  await page.reload();

  await page.click('button:has-text("Marquer accepté")');
  await page.waitForURL(/\/app\/facturation\/factures\/.+/);

  // Le devis accepté doit avoir ouvert un Dossier + un Projet — voir
  // docs/palier-2-*, section 3.
  await page.goto("/app/projets");
  await expect(page.getByRole("heading", { name: "Dossiers" })).toBeVisible();
  await page.click('a:has-text("Cabinet Fidèle")');
  await page.waitForURL(/\/app\/projets\/dossiers\/.+/);

  await expect(page.getByRole("heading", { name: "Cabinet Fidèle" })).toBeVisible();
  // Vocabulaire "cabinet" → le Projet s'appelle "Mission".
  await expect(page.getByText(/^Mission — DEV-\d{4}-\d{6}$/)).toBeVisible();

  await page.click('a:has-text("Mission — DEV")');
  await page.waitForURL(/\/app\/projets\/(?!dossiers).+/);

  // Nouvelle tâche
  await page.click('button:has-text("Nouvelle tâche")');
  await page.fill("#titre", "Préparer le dossier fiscal");
  await page.click('form:has(#titre) button:has-text("Ajouter")');
  await expect(page.getByText("Préparer le dossier fiscal")).toBeVisible();

  // Achèvement de la tâche via le sélecteur de statut — nom accessible
  // unique par tâche (voir ligne-tache.tsx) pour éviter toute ambiguïté
  // avec le <select> assigneAId du formulaire "Nouvelle tâche" resté ouvert.
  // Timeout local élargi (30s, comme pour l'envoi d'email au Palier 1) :
  // ce changement passe par une transition React + Server Action +
  // revalidatePath, plus lent que les 15s globaux sous latence Neon réelle
  // — constaté réellement (passe en <15s certains runs, échoue à 15s
  // pile sur d'autres, jamais sur la même étape deux fois de suite).
  await page.getByRole("combobox", { name: "Statut de la tâche Préparer le dossier fiscal" }).selectOption("TERMINEE");
  await expect(page.getByText("Préparer le dossier fiscal")).toHaveClass(/line-through/, { timeout: 30_000 });

  const [taches] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(tache).where(eq(tache.titre, "Préparer le dossier fiscal")));
  expect(taches.statut).toBe("TERMINEE");
  expect(taches.termineeLe).not.toBeNull();

  // Commentaire sur le Projet
  await page.fill('textarea[name="contenu"]', "Premier échange avec le client, en attente de documents.");
  await page.click('button:has-text("Commenter")');
  await expect(page.getByText("Premier échange avec le client")).toBeVisible({ timeout: 30_000 });
});

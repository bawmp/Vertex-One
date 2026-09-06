import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "../src/db/client";
import { entreprise, utilisateur, compte, session, prospect, devis, ligneDevis, facture, ligneFacture, paiement } from "../src/db/schema";

// Parcours critique Palier 1, section 9 : compléter le NIU, créer un
// prospect, créer un devis, l'envoyer, l'accepter (facture générée
// automatiquement avec numérotation séquentielle), marquer la facture comme
// payée — vérifié dans un vrai navigateur contre la vraie base.
const emailAdmin = `e2e-p1-${Date.now()}@vertexone.test`;
const motDePasse = "mot-de-passe-test-12345";

let entrepriseId: string;

test.afterAll(async () => {
  if (!entrepriseId) return;
  await avecEntreprise(entrepriseId, async (tx) => {
    await tx.delete(paiement).where(eq(paiement.entrepriseId, entrepriseId));
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

test("prospect → devis → facture (numérotation) → paiement", async ({ page }) => {
  // Ce parcours enchaîne 7 Server Actions réelles contre Neon ; chacune a
  // individuellement réussi lors des runs précédents mais leur somme dépasse
  // le timeout global (60s) — une requête isolée a même mis 26s sur cette
  // base sollicitée intensément. Voir CLAUDE.md, latence Neon.
  test.setTimeout(150_000);

  await page.goto("/inscription");
  await page.fill("#nomEntreprise", "TEST E2E Palier 1");
  await page.selectOption("#secteurProfil", "agence");
  await page.fill("#nomComplet", "Admin E2E");
  await page.fill("#email", emailAdmin);
  await page.fill("#motDePasse", motDePasse);
  await page.click('button[type="submit"]');
  await page.waitForURL("/app");

  const [admin] = await db.select().from(utilisateur).where(eq(utilisateur.email, emailAdmin));
  entrepriseId = admin.entrepriseId;

  // Sans NIU, la création de devis doit être bloquée (docs/palier-1-*, section 2).
  await page.goto("/app/parametres/entreprise");
  await page.fill("#niu", "M012345678901X");
  await page.fill("#rccm", "RC/DLA/2026/B/1234");
  await page.click('button[type="submit"]');
  await page.waitForURL("/app/crm");

  await page.goto("/app/crm/nouveau");
  await page.fill("#nom", "Garage Mbarga");
  await page.fill("#societeCliente", "Garage Mbarga SARL");
  await page.fill("#telephone", "+237600000000");
  await page.fill("#email", `e2e-p1-client-${Date.now()}@vertexone.test`);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app\/crm\/.+/);

  await page.click('a:has-text("Créer un devis")');
  await page.waitForURL(/\/app\/facturation\/devis\/nouveau/);

  await page.fill('input[name="dateValidite"]', "2026-12-31");
  await page.fill('input[name="designation"]', "Prestation de conseil");
  await page.fill('input[name="quantite"]', "2");
  await page.fill('input[name="prixUnitaire"]', "50000");
  await expect(page.getByText(/119\s?250 FCFA/)).toBeVisible(); // 100000 HT + 19.25% TVA
  await page.click('button:has-text("Créer le devis")');
  await page.waitForURL(/\/app\/facturation\/devis\/(?!nouveau)/);

  await expect(page.getByRole("heading", { name: /^DEV-\d{4}-\d{6}$/ })).toBeVisible();

  const urlDevis = page.url();
  const reponsePdfDevis = await page.request.get(`${urlDevis}/pdf`);
  expect(reponsePdfDevis.status()).toBe(200);
  expect(reponsePdfDevis.headers()["content-type"]).toBe("application/pdf");
  const octetsPdfDevis = await reponsePdfDevis.body();
  expect(octetsPdfDevis.subarray(0, 4).toString("latin1")).toBe("%PDF");

  // Envoi réel via Resend, PDF généré et joint — comme pour la relance
  // (voir palier-1-relance-facture.test.ts), le compte Resend n'a pas de
  // domaine vérifié : l'API refuse tout destinataire autre que le
  // propriétaire du compte (erreur réelle "You can only send testing
  // emails..."). Ce test vérifie que l'appel réel a bien lieu et que
  // l'échec est remonté proprement à l'écran, pas avalé silencieusement.
  // Timeout local à 30s (au lieu des 15s globaux) : cette action cumule une
  // requête Neon, un rendu PDF réel (CPU) et un appel réseau Resend — plus
  // lent que les autres Server Actions du parcours, surtout en exécution
  // parallèle (constaté réellement : passe seul en <15s, dépasse 15s à deux
  // workers concurrents).
  await page.click('button:has-text("Envoyer au client par email")');
  await expect(page.getByText(/own email address|validation_error|RESEND_API_KEY/i)).toBeVisible({ timeout: 30_000 });

  // Le statut ne peut donc pas passer à ENVOYE par un envoi réellement
  // réussi dans cet environnement de test (même limitation que ci-dessus) —
  // on le positionne directement pour vérifier la suite du parcours
  // (acceptation → génération de facture), déjà couverte du côté "devis
  // accepté" par accepterDevis lui-même.
  const idDevis = urlDevis.split("/").pop()!;
  await avecEntreprise(entrepriseId, (tx) => tx.update(devis).set({ statut: "ENVOYE" }).where(eq(devis.id, idDevis)));
  await page.reload();
  await expect(page.getByText("Envoyé")).toBeVisible();

  await page.click('button:has-text("Marquer accepté")');
  await page.waitForURL(/\/app\/facturation\/factures\/.+/);

  await expect(page.getByRole("heading", { name: /^FAC-\d{4}-\d{6}$/ })).toBeVisible();
  await expect(page.getByText("119")).toBeVisible();

  const urlFacture = page.url();
  const reponsePdfFacture = await page.request.get(`${urlFacture}/pdf`);
  expect(reponsePdfFacture.status()).toBe(200);
  expect(reponsePdfFacture.headers()["content-type"]).toBe("application/pdf");
  const octetsPdfFacture = await reponsePdfFacture.body();
  expect(octetsPdfFacture.subarray(0, 4).toString("latin1")).toBe("%PDF");

  // Même vérification que pour le devis : appel Resend réel, échec attendu
  // (domaine non vérifié) remonté proprement à l'écran — même timeout élargi
  // pour la même raison (PDF + Resend cumulés).
  await page.click('button:has-text("Envoyer par email")');
  await expect(page.getByText(/own email address|validation_error|RESEND_API_KEY/i)).toBeVisible({ timeout: 30_000 });

  await page.click('button:has-text("Marquer comme payée")');
  await expect(page.getByText("Payée")).toBeVisible();

  await page.goto("/app");
  await expect(page.getByText(/119\s?250 FCFA/)).toBeVisible();
});

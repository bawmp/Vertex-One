import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "../src/db/client";
import { entreprise, utilisateur, compte, session, invitation, dossierRH } from "../src/db/schema";

// Parcours critique Palier 0, section 9 étape 5 : un Administrateur invite
// un Employé, qui active son compte via le lien reçu — vérifie que le rôle
// et l'entrepriseId viennent uniquement de la ligne "invitation" (jamais du
// formulaire d'acceptation, qui ne les propose pas), et qu'un DossierRH est
// créé automatiquement (section 8).
//
// Note : dossierRH et invitation sont protégées par une RLS stricte — toute
// lecture/écriture ici passe par avecEntreprise(), exactement comme le
// ferait du vrai code applicatif (voir CLAUDE.md). utilisateur/session/
// compte restent permissives (tables Better-Auth), pas besoin du wrapper.
const emailAdmin = `e2e-admin-${Date.now()}@vertexone.test`;
const emailInvite = `e2e-invite-${Date.now()}@vertexone.test`;
const motDePasse = "mot-de-passe-test-12345";

let entrepriseId: string | undefined;

test.afterAll(async () => {
  if (!entrepriseId) return;

  await avecEntreprise(entrepriseId, (tx) => tx.delete(dossierRH).where(eq(dossierRH.entrepriseId, entrepriseId!)));
  await avecEntreprise(entrepriseId, (tx) => tx.delete(invitation).where(eq(invitation.entrepriseId, entrepriseId!)));

  for (const email of [emailAdmin, emailInvite]) {
    const [u] = await db.select().from(utilisateur).where(eq(utilisateur.email, email));
    if (u) {
      await db.delete(session).where(eq(session.userId, u.id));
      await db.delete(compte).where(eq(compte.userId, u.id));
      await db.delete(utilisateur).where(eq(utilisateur.id, u.id));
    }
  }

  await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
});

test("un Administrateur invite un Employé, qui active son compte via le lien reçu", async ({ page }) => {
  await page.goto("/inscription");
  await page.fill("#nomEntreprise", "TEST E2E Invitation");
  await page.selectOption("#secteurProfil", "agence");
  await page.fill("#nomComplet", "Admin E2E");
  await page.fill("#email", emailAdmin);
  await page.fill("#motDePasse", motDePasse);
  await page.click('button[type="submit"]');
  await page.waitForURL("/app");

  const [admin] = await db.select().from(utilisateur).where(eq(utilisateur.email, emailAdmin));
  entrepriseId = admin.entrepriseId;

  await page.goto("/app/parametres/equipe");
  await page.fill("#email", emailInvite);
  await page.selectOption("#roleProposee", "EMPLOYE");
  await page.fill("#postePropose", "Chargé de clientèle");
  await page.fill("#dateEmbauchePropose", "2026-01-15");
  await page.click('button[type="submit"]');

  await expect(page.getByText(/Invitation créée/)).toBeVisible();

  const [inv] = await avecEntreprise(entrepriseId, (tx) =>
    tx.select().from(invitation).where(eq(invitation.email, emailInvite))
  );
  expect(inv).toBeDefined();

  await page.goto(`/invitation/${inv.jeton}`);
  await expect(page.getByText(emailInvite)).toBeVisible();
  await expect(page.getByText("EMPLOYE")).toBeVisible();

  await page.fill("#nomComplet", "Invité E2E");
  await page.fill("#motDePasse", motDePasse);
  await page.click('button[type="submit"]');

  await page.waitForURL("/app");
  await expect(page.locator("nav").getByText("EMPLOYE")).toBeVisible();

  const [nouvelUtilisateur] = await db.select().from(utilisateur).where(eq(utilisateur.email, emailInvite));
  expect(nouvelUtilisateur.role).toBe("EMPLOYE");
  expect(nouvelUtilisateur.entrepriseId).toBe(entrepriseId);

  const [fiche] = await avecEntreprise(entrepriseId, (tx) =>
    tx.select().from(dossierRH).where(eq(dossierRH.utilisateurId, nouvelUtilisateur.id))
  );
  expect(fiche.poste).toBe("Chargé de clientèle");
  expect(fiche.dateEmbauche.toISOString().slice(0, 10)).toBe("2026-01-15");
});

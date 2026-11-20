import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { MOT_DE_PASSE } from "./aide-equipe";
import { supprimerEntrepriseDeTest } from "../tests/aide-nettoyage";
import { avecEntreprise, db } from "../src/db/client";
import { compteElyonpay, contact, entreprise, facture, utilisateur } from "../src/db/schema";
import { obtenirOuCreerLien } from "../src/lib/client-documents/liens";
import { CONTEXTE_PAIEMENT, chiffrerConfig } from "../src/lib/boutique/chiffrement";

// Chaque entreprise encaisse sur SON compte ElyonPay : la page de réglages, ce que voit l'équipe sur la fiche facture, et surtout ce que voit le CLIENT sur le lien de
// sa facture (« Payer maintenant » seulement si le compte est branché). La clé d'essai est refusée par la vraie API d'ElyonPay (aucun paiement, aucun argent) ; le
// compte branché ensuite est écrit directement en base (aucun paiement réel n'est lancé dans ce test).
const ATTENTE = { timeout: 60_000 };
let nomEntreprise = "";

test.afterAll(async () => {
  if (nomEntreprise) await supprimerEntrepriseDeTest(nomEntreprise);
});

test("Compte ElyonPay de l'entreprise : réglages, fiche facture, page du client", async ({ page, browser }) => {
  test.setTimeout(500_000);
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  nomEntreprise = `TEST compteelyon ${suffixe}`;
  const emailAdmin = `compteelyon-admin-${suffixe}@vertexone.test`;
  await page.goto("/inscription");
  await page.fill("#nomEntreprise", nomEntreprise);
  await page.getByRole("radio", { name: "Agence" }).click();
  await page.fill("#nomComplet", "Alice Admin");
  await page.fill("#email", emailAdmin);
  await page.fill("#motDePasse", MOT_DE_PASSE);
  await page.click('button[type="submit"]');
  await page.waitForURL("/app", { timeout: 120_000 });

  // Une facture émise que le client a ACCEPTÉE (il peut donc la régler), et son lien public, créés directement en base.
  const [{ id: entrepriseId }] = await db.select({ id: entreprise.id }).from(entreprise).where(eq(entreprise.nom, nomEntreprise));
  const [{ id: adminId }] = await db.select({ id: utilisateur.id }).from(utilisateur).where(eq(utilisateur.email, emailAdmin));
  const { factureId, jeton } = await avecEntreprise(entrepriseId, async (tx) => {
    const [c] = await tx.insert(contact).values({ entrepriseId, nom: "Jean Mbarga", telephone: "690111222", assigneAId: adminId }).returning({ id: contact.id });
    const [fac] = await tx
      .insert(facture)
      .values({ entrepriseId, numero: `FAC-${suffixe}`, contactId: c.id, assigneAId: adminId, montantHT: 120000, montantTVA: 0, montantTTC: 120000, dateEcheance: new Date(Date.now() + 15 * 86_400_000), reponseClient: "ACCEPTEE", reponseClientLe: new Date() })
      .returning({ id: facture.id });
    return { factureId: fac.id, jeton: await obtenirOuCreerLien(tx, entrepriseId, { factureId: fac.id }) };
  });

  // ===== SANS compte : le client n'a pas « Payer maintenant » ; l'équipe sait pourquoi =====
  const contexteClient = await browser.newContext();
  const client = await contexteClient.newPage();
  await client.goto(`/facture/${jeton}`);
  await expect(client.getByRole("heading", { name: "Régler cette facture" })).toBeVisible(ATTENTE);
  await expect(client.getByText(/Le paiement en ligne n'est pas proposé par/)).toBeVisible(ATTENTE);
  await expect(client.getByText("Payer maintenant")).toHaveCount(0);

  await page.goto(`/app/facturation/factures/${factureId}`);
  await expect(page.getByText(/Paiement en ligne non activé/)).toBeVisible(ATTENTE);
  await expect(page.getByRole("button", { name: "Encaisser par Mobile Money" })).toHaveCount(0);

  // ===== Réglages : non branché ; champs invalides ; clé refusée par ElyonPay (jamais enregistrée) =====
  await page.getByRole("link", { name: "Brancher mon compte" }).click();
  await page.waitForURL(/\/app\/parametres\/paiement-mobile-money/, ATTENTE);
  await expect(page.getByRole("heading", { name: /Paiement Mobile Money/ })).toBeVisible(ATTENTE);
  await expect(page.getByText("Non branché", { exact: true }).first()).toBeVisible(ATTENTE);
  await expect(page.getByText(/Vertex One ne le reçoit jamais et ne le détient jamais/)).toBeVisible(ATTENTE);

  await page.getByLabel("Identifiant marchand ElyonPay").fill("abc");
  await page.getByLabel("Clé d'API ElyonPay").fill("pk_live_cle_de_test_invalide_123456");
  await page.getByRole("button", { name: "Vérifier et brancher" }).click();
  await expect(page.getByText(/identifiant marchand est un nombre/)).toBeVisible(ATTENTE);

  await page.getByLabel("Identifiant marchand ElyonPay").fill("595");
  await page.getByRole("button", { name: "Vérifier et brancher" }).click();
  await expect(page.getByText(/ElyonPay a refusé cette clé d'API/)).toBeVisible({ timeout: 90_000 });
  expect(await db.select().from(compteElyonpay).where(eq(compteElyonpay.entrepriseId, entrepriseId))).toHaveLength(0);
  await expect(page.getByText("Non branché", { exact: true }).first()).toBeVisible(ATTENTE);

  // ===== AVEC un compte (écrit en base) : le client voit « Payer maintenant », l'équipe « Encaisser par Mobile Money » =====
  const CLE = `pk_live_e2e_${suffixe.replace(/\W/g, "")}_wxyz`;
  await avecEntreprise(entrepriseId, (tx) =>
    tx.insert(compteElyonpay).values({ entrepriseId, marchandId: 595, nomMarchand: "Garage Mbarga", configChiffree: chiffrerConfig({ cle: CLE }, CONTEXTE_PAIEMENT), cleFin: CLE.slice(-4), creeParId: adminId, verifieLe: new Date() }),
  );

  await page.goto("/app/parametres/paiement-mobile-money");
  await expect(page.getByText("Compte branché", { exact: true }).first()).toBeVisible(ATTENTE);
  await expect(page.getByText(`••••••••${CLE.slice(-4)}`)).toBeVisible(ATTENTE); // seuls les 4 derniers caractères
  await expect(page.getByText("595", { exact: true }).first()).toBeVisible(ATTENTE);
  expect(await page.content()).not.toContain(CLE); // la clé n'est nulle part dans la page

  await page.goto(`/app/facturation/factures/${factureId}`);
  await expect(page.getByRole("button", { name: "Encaisser par Mobile Money" })).toBeVisible(ATTENTE);
  await expect(page.getByText(/Paiement en ligne non activé/)).toHaveCount(0);

  await client.reload();
  await expect(client.getByText("Payer maintenant")).toBeVisible(ATTENTE);
  await expect(client.getByText(/Le paiement en ligne n'est pas proposé par/)).toHaveCount(0);

  // ===== Retirer le compte : le paiement en ligne disparaît de nouveau (deux temps) =====
  await page.goto("/app/parametres/paiement-mobile-money");
  await page.getByRole("button", { name: "Retirer ce compte" }).click();
  await expect(page.getByText(/Vos clients ne pourront plus payer en ligne/)).toBeVisible(ATTENTE);
  await page.getByRole("button", { name: "Oui, retirer" }).click();
  await expect(page.getByText("Non branché", { exact: true }).first()).toBeVisible(ATTENTE);
  await client.reload();
  await expect(client.getByText("Payer maintenant")).toHaveCount(0);
  await contexteClient.close();
});

import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { MOT_DE_PASSE } from "./aide-equipe";
import { supprimerEntrepriseDeTest } from "../tests/aide-nettoyage";
import { avecEntreprise, db } from "../src/db/client";
import { contact, entreprise, facture, produit, utilisateur } from "../src/db/schema";
import { genererEcrituresFactureEmise } from "../src/lib/comptabilite/ecritures";

// Parcours de contrôle des fonctions de la priorité 3 (numéros de série) et 4 (menu Stock, exports, comptabilité analytique, devises,
// exercice décalé, déclarations fiscales), sur une entreprise « TEST … » créée par une vraie inscription, en local.
const ATTENTE = { timeout: 60_000 };
let nomEntreprise = "";

test.afterAll(async () => {
  if (nomEntreprise) await supprimerEntrepriseDeTest(nomEntreprise);
});

test("Priorités 3 et 4 : menu Stock, numéros de série, exports, analytique, devises, exercice, déclarations", async ({ page }) => {
  test.setTimeout(400_000);
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  nomEntreprise = `TEST prio4 ${suffixe}`;
  const email = `prio4-admin-${suffixe}@vertexone.test`;
  await page.goto("/inscription");
  await page.fill("#nomEntreprise", nomEntreprise);
  await page.getByRole("radio", { name: "Agence" }).click();
  await page.fill("#nomComplet", "Alice Admin");
  await page.fill("#email", email);
  await page.fill("#motDePasse", MOT_DE_PASSE);
  await page.click('button[type="submit"]');
  await page.waitForURL("/app", { timeout: 120_000 });

  // Données de départ : gestion de stock active, un produit suivi, une facture émise avec ses écritures.
  const [{ id: entrepriseId }] = await db.select({ id: entreprise.id }).from(entreprise).where(eq(entreprise.nom, nomEntreprise));
  const [{ id: adminId }] = await db.select({ id: utilisateur.id }).from(utilisateur).where(eq(utilisateur.email, email));
  await db.update(entreprise).set({ gereStock: true }).where(eq(entreprise.id, entrepriseId));
  const { produitId, factureId } = await avecEntreprise(entrepriseId, async (tx) => {
    const [p] = await tx.insert(produit).values({ entrepriseId, type: "BIEN", nom: "Telephone E2E", suiviStock: true, creeParId: adminId }).returning({ id: produit.id });
    const [c] = await tx.insert(contact).values({ entrepriseId, nom: "Jean Mbarga", telephone: "690111222", assigneAId: adminId }).returning({ id: contact.id });
    const numero = `FAC-${suffixe}`;
    const emission = new Date();
    const [f] = await tx.insert(facture).values({ entrepriseId, numero, contactId: c.id, assigneAId: adminId, montantHT: 100000, montantTVA: 0, montantTTC: 100000, dateEmission: emission, dateEcheance: new Date(Date.now() + 30 * 86_400_000) }).returning({ id: facture.id });
    await genererEcrituresFactureEmise(tx, { id: f.id, entrepriseId, numero, dateEmission: emission, montantHT: 100000, montantTVA: 0, montantTTC: 100000 });
    return { produitId: p.id, factureId: f.id };
  });

  // ===== 1. Menu : catégorie Stock et raccourcis =====
  await page.goto("/app/facturation");
  await page.locator("nav").getByText("One Books", { exact: true }).first().click().catch(() => {});
  await expect(page.getByText("Numéros de série", { exact: true }).first()).toBeAttached(ATTENTE);

  // ===== 2. Numéros de série : activer, ajouter, rechercher =====
  await page.goto(`/app/produits/${produitId}`);
  await page.getByRole("tab", { name: "Stock", exact: true }).click();
  await page.getByRole("button", { name: "Activer le suivi par numéro de série" }).click();
  await expect(page.getByText("Suivi par numéro de série activé.")).toBeVisible(ATTENTE);
  await page.getByLabel("Numéros de série (un par ligne, ou séparés par une virgule)").fill("SN-E2E-1\nSN-E2E-2");
  await expect(page.getByText("2 numéro(s) lu(s).")).toBeVisible(ATTENTE);
  await page.getByRole("button", { name: "Ajouter les numéros" }).click();
  await expect(page.getByText("2 numéro(s) de série ajouté(s).")).toBeVisible(ATTENTE);
  await page.goto("/app/produits/series?q=E2E-2");
  await expect(page.getByText("SN-E2E-2")).toBeVisible(ATTENTE);
  await expect(page.getByText("SN-E2E-1")).toHaveCount(0);

  // ===== 3. Exports : Sage, Ciel, fichier des écritures, PDF =====
  const base = "/app/comptabilite/livres/export?du=2020-01-01&au=2099-12-31";
  const sage = await page.request.get(`${base}&vue=ecritures&format=sage`);
  expect(sage.status()).toBe(200);
  expect(await sage.text()).toContain("Journal\tDate\tPiece\tCompte");
  const ciel = await page.request.get(`${base}&vue=ecritures&format=ciel`);
  expect(ciel.status()).toBe(200);
  expect(await ciel.text()).toContain("Numero\tDate\tJournal");
  const fec = await page.request.get(`${base}&vue=ecritures&format=fec`);
  expect(await fec.text()).toContain("JournalCode;EcritureNum");
  expect((await page.request.get(`${base}&vue=ecritures&format=inconnu`)).status()).toBe(404);
  const pdf = await page.request.get(`${base}&vue=balance&format=pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  // ===== 4. Comptabilité analytique : section, rattachement, résultat =====
  await page.goto("/app/comptabilite/analytique");
  const nouvelle = page.getByRole("form", { name: "Nouvelle section analytique" });
  await nouvelle.getByLabel("Code").fill("chantier-1");
  await nouvelle.getByLabel("Nom").fill("Chantier Bonanjo");
  await nouvelle.getByRole("button", { name: "Ajouter la section" }).click();
  await expect(page.getByText("Section créée.")).toBeVisible(ATTENTE);
  await page.reload();
  await page.getByRole("combobox", { name: "Section analytique", exact: true }).first().selectOption({ label: "CHANTIER-1 — Chantier Bonanjo" });
  await expect(page.getByText("2 écriture(s) rattachée(s) à la section.")).toBeVisible(ATTENTE);
  await page.reload();
  const ligne = page.locator("div").filter({ hasText: /^CHANTIER-1 — Chantier Bonanjo/ }).first();
  await expect(ligne).toContainText("100");

  // ===== 5. Devises : un taux, puis l'équivalent sur la facture =====
  await page.goto("/app/parametres/devises");
  const taux = page.getByRole("form", { name: "Nouveau taux de change" });
  await taux.getByLabel("Devise (EUR, USD…)").fill("EUR");
  await taux.getByLabel("FCFA pour une unité").fill("655,957");
  await taux.getByLabel("En vigueur depuis le").fill("2020-01-01");
  await taux.getByRole("button", { name: "Enregistrer le taux" }).click();
  await expect(page.getByText("Taux enregistré.")).toBeVisible(ATTENTE);
  await page.goto(`/app/facturation/factures/${factureId}`);
  await expect(page.getByText(/≈/).first()).toBeVisible(ATTENTE);
  await expect(page.getByText(/152,45/).first()).toBeVisible(ATTENTE);

  // ===== 6. Exercice décalé : choisir septembre =====
  await page.goto("/app/comptabilite/cloture");
  await page.locator("label", { hasText: "Mon exercice commence en" }).locator("select").selectOption("9");
  await expect(page.getByText("Début de l'exercice enregistré.")).toBeVisible(ATTENTE);
  await page.reload();
  await expect(page.getByText(/du 01\/09\/\d{4} au 31\/08\/\d{4}/).first()).toBeVisible(ATTENTE);

  // ===== 7. Déclarations fiscales : noter une déclaration de TVA, estimer l'impôt =====
  await page.goto("/app/comptabilite/declarations");
  await expect(page.getByText("Déclarations fiscales").first()).toBeVisible(ATTENTE);
  const premiere = page.locator("div.px-4.py-3").first();
  await premiere.getByLabel("Statut").selectOption("PAYEE");
  await premiere.getByLabel("Montant déclaré").fill("12345");
  await premiere.getByLabel("Référence du récépissé").fill("REC-E2E");
  await premiere.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Déclaration enregistrée.").first()).toBeVisible(ATTENTE);
  await page.reload();
  await expect(page.getByText("Payée").first()).toBeVisible(ATTENTE);
  await expect(page.getByText(/Impôt estimé/)).toBeVisible(ATTENTE);
});

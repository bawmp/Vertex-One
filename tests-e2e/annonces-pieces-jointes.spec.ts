import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { avecEntreprise, db } from "../src/db/client";
import { utilisateur, annonce, pieceJointeAnnonce } from "../src/db/schema";
import { creerEquipe, supprimerEntrepriseDeTest, type Equipe } from "./aide-equipe";

// One Announcements — pièces jointes : publication, visibilité côté Employé, accès aux fichiers, refus, suppression.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const TEXTE = "Nouveau règlement intérieur, lisez le document joint";

let equipe: Equipe | undefined;
let nomEntreprise = "";

test.afterAll(async () => {
  await equipe?.contexteEmploye.close();
  if (nomEntreprise) await supprimerEntrepriseDeTest(nomEntreprise);
});

test("annonces avec pièces jointes : publier, consulter, refuser, supprimer", async ({ page: alice, browser }) => {
  test.setTimeout(600_000);
  equipe = await creerEquipe(alice, browser, "annonces");
  nomEntreprise = equipe.nomEntreprise;
  const bob = equipe.employe;
  const pieces = alice.getByRole("list", { name: "Pièces jointes de l'annonce" });

  // ===== Publication : texte + image + PDF (une pièce retirée avant l'envoi) =====
  await alice.goto("/app/annonces");
  await alice.getByPlaceholder(/Écrire une annonce/).fill(TEXTE);
  await alice.locator('input[type="file"]').setInputFiles([
    { name: "plan.png", mimeType: "image/png", buffer: PNG },
    { name: "reglement.pdf", mimeType: "application/pdf", buffer: PDF },
  ]);
  await expect(pieces.getByText("reglement.pdf")).toBeVisible();
  await alice.getByRole("button", { name: "Retirer plan.png" }).click();
  await expect(pieces.getByText("plan.png")).toHaveCount(0);
  await alice.locator('input[type="file"]').setInputFiles([{ name: "plan.png", mimeType: "image/png", buffer: PNG }]);
  await expect(pieces.getByText(/\.(png|pdf)$/)).toHaveCount(2);
  await alice.getByRole("button", { name: "Publier" }).click();
  await expect(alice.getByText(TEXTE)).toBeVisible({ timeout: 90_000 });
  await expect(alice.getByPlaceholder(/Écrire une annonce/)).toHaveValue("");
  await expect(pieces).toHaveCount(0);

  const image = alice.getByRole("img", { name: "plan.png" });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 90_000 }).toBeGreaterThan(0);
  await expect(alice.getByRole("link", { name: /reglement\.pdf/ })).toBeVisible();

  // ===== Un Employé voit l'annonce et ses fichiers, sans pouvoir publier =====
  await bob.goto("/app/annonces");
  await expect(bob.getByText(TEXTE)).toBeVisible({ timeout: 90_000 });
  await expect(bob.getByPlaceholder(/Écrire une annonce/)).toHaveCount(0);
  const imageBob = bob.getByRole("img", { name: "plan.png" });
  await expect.poll(() => imageBob.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 90_000 }).toBeGreaterThan(0);

  // Le PDF part en URL signée temporaire ; sans session, le proxy renvoie vers la connexion.
  const href = (await bob.getByRole("link", { name: /reglement\.pdf/ }).getAttribute("href"))!;
  const telechargement = await bob.request.get(href, { maxRedirects: 0 });
  expect(telechargement.status()).toBe(307);
  expect(telechargement.headers()["location"]).toMatch(/^https:\/\//);
  const anonyme = await (await browser.newContext()).request.get(new URL(href, "http://localhost:3000").toString(), { maxRedirects: 0 });
  expect(anonyme.status()).toBe(307);
  expect(anonyme.headers()["location"]).toContain("/connexion");

  // ===== Une annonce composée d'un seul PDF, sans texte, est valable =====
  await alice.getByPlaceholder(/Écrire une annonce/).fill("");
  await alice.locator('input[type="file"]').setInputFiles([{ name: "planning.pdf", mimeType: "application/pdf", buffer: PDF }]);
  await alice.getByRole("button", { name: "Publier" }).click();
  await expect(alice.getByRole("link", { name: /planning\.pdf/ })).toBeVisible({ timeout: 90_000 });

  // ===== Refus : annonce vide, faux PDF, plus de cinq fichiers =====
  await alice.getByRole("button", { name: "Publier" }).click();
  await expect(alice.getByText(/ne peut pas être vide/)).toBeVisible({ timeout: 60_000 });

  await alice.getByPlaceholder(/Écrire une annonce/).fill("Test faux fichier");
  await alice.locator('input[type="file"]').setInputFiles([{ name: "faux.pdf", mimeType: "application/pdf", buffer: Buffer.from("ceci n'est pas un pdf") }]);
  await alice.getByRole("button", { name: "Publier" }).click();
  await expect(alice.getByText(/faux\.pdf.*Type de fichier non accepté/)).toBeVisible({ timeout: 60_000 });
  await expect(alice.getByText("Test faux fichier", { exact: true })).toHaveCount(0);

  await alice.locator('input[type="file"]').setInputFiles(Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.png`, mimeType: "image/png", buffer: PNG })));
  await expect(alice.getByText(/5 pièces jointes au maximum/)).toBeVisible();
  await expect(alice.getByRole("button", { name: "Publier" })).toBeDisabled();

  // ===== Suppression : l'annonce, ses pièces en base et l'accès au fichier disparaissent =====
  const [u] = await db.select().from(utilisateur).where(eq(utilisateur.email, equipe.emailAdmin));
  const lire = () => avecEntreprise(u.entrepriseId, async (tx) => ({ annonces: await tx.select().from(annonce), pieces: await tx.select().from(pieceJointeAnnonce) }));
  const avant = await lire();
  expect(avant.pieces).toHaveLength(3); // plan.png + reglement.pdf + planning.pdf

  await alice.reload();
  const carte = alice.locator("div", { has: alice.getByText(TEXTE) }).filter({ has: alice.getByRole("button", { name: "Supprimer" }) }).last();
  await carte.getByRole("button", { name: "Supprimer" }).click();
  await expect(alice.getByText(TEXTE)).toHaveCount(0, { timeout: 90_000 });

  const apres = await lire();
  expect(apres.annonces).toHaveLength(avant.annonces.length - 1);
  expect(apres.pieces).toHaveLength(1); // seule planning.pdf reste
  expect((await bob.request.get(href, { maxRedirects: 0 })).status()).toBe(404);
});

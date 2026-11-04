import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { creerEquipe, supprimerEntrepriseDeTest, type Equipe } from "./aide-equipe";
import { avecEntreprise, db } from "../src/db/client";
import { dossierRH, utilisateur } from "../src/db/schema";

// Fiche collaborateur : l'employé complète sa fiche (naissance, coordonnées) et pose sa photo lui-même ; l'Administrateur voit la fiche, la photo
// et l'anniversaire à venir sur la page RH ; seuls l'Administrateur et l'intéressé voient le salaire.
const ATTENTE = { timeout: 60_000 };
let equipe: Equipe | null = null;

test.afterAll(async () => {
  if (equipe) {
    await equipe.contexteEmploye.close();
    await supprimerEntrepriseDeTest(equipe.nomEntreprise);
  }
});

// PNG 1×1 valide.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("Fiche collaborateur : infos, photo, anniversaire, salaire réservé", async ({ page, browser }) => {
  test.setTimeout(700_000);
  equipe = await creerEquipe(page, browser, "fiche");
  const { admin, employe } = equipe;

  // ===== L'employé ouvre sa fiche (redirection depuis /app/rh), complète ses infos et pose sa photo =====
  await employe.goto("/app/rh");
  await expect(employe.getByRole("heading", { name: "Bob Employé" })).toBeVisible(ATTENTE);
  await expect(employe.getByText("Salaire de base")).toBeVisible(ATTENTE); // la personne concernée voit son salaire (non renseigné)
  const dansTroisJours = new Date(Date.now() + 3 * 86_400_000 + 3600_000);
  const naissance = `1995-${String(dansTroisJours.getUTCMonth() + 1).padStart(2, "0")}-${String(dansTroisJours.getUTCDate()).padStart(2, "0")}`;
  await employe.locator("#dateNaissance").fill(naissance);
  await employe.locator("#telephone").fill("+237 690 11 22 33");
  await employe.locator("#adresse").fill("Bonamoussadi, Douala");
  await employe.locator("#urgenceNom").fill("Marie Employé");
  await employe.locator("#urgenceTelephone").fill("677 00 11 22");
  await employe.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(employe.getByText("Informations enregistrées.")).toBeVisible(ATTENTE);

  // Une date de naissance dans le futur est refusée avec un message.
  await employe.locator("#dateNaissance").fill("2090-01-01");
  await employe.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(employe.getByText("La date de naissance ne peut pas être dans le futur.")).toBeVisible(ATTENTE);
  await employe.locator("#dateNaissance").fill(naissance);

  await employe.locator("#photo-fiche").setInputFiles({ name: "moi.png", mimeType: "image/png", buffer: PNG });
  await expect(employe.getByText("Photo enregistrée.")).toBeVisible(ATTENTE);
  await employe.reload();
  await expect(employe.locator('img[alt="Photo de Bob Employé"]')).toHaveAttribute("src", /\/app\/rh\/photo\/utilisateur\//);

  // Une image truquée est refusée.
  await employe.locator("#photo-fiche").setInputFiles({ name: "faux.png", mimeType: "image/png", buffer: Buffer.from("pas une image") });
  await expect(employe.getByText(/image|format|type/i).first()).toBeVisible(ATTENTE);

  // ===== L'Administrateur voit l'anniversaire à venir, la fiche, la photo et peut voir le salaire =====
  await admin.goto("/app/rh");
  await expect(admin.getByText("Anniversaires à venir")).toBeVisible(ATTENTE);
  await expect(admin.getByText("Dans 3 jours", { exact: false }).first()).toBeVisible(ATTENTE);
  await admin.getByRole("link", { name: /Bob Employé/ }).first().click();
  await expect(admin.getByRole("heading", { name: "Bob Employé" })).toBeVisible(ATTENTE);
  await expect(admin.getByText("+237 690 11 22 33")).toBeVisible(ATTENTE);
  await expect(admin.getByText("Marie Employé — 677 00 11 22")).toBeVisible(ATTENTE);
  await expect(admin.getByText("Salaire de base")).toBeVisible(ATTENTE);
  await expect(admin.getByText("Aucune tâche en cours.")).toBeVisible(ATTENTE);
  await expect(admin.locator('img[alt="Photo de Bob Employé"]')).toBeVisible(ATTENTE);
  // La photo est servie par la route contrôlée : une session sans cookie n'y accède pas.
  const src = (await admin.locator('img[alt="Photo de Bob Employé"]').getAttribute("src"))!.split("?")[0];
  const anonyme = await (await browser.newContext()).request.get(new URL(src, "http://localhost:3000").toString(), { maxRedirects: 0 });
  expect([307, 401, 404]).toContain(anonyme.status());

  // ===== Le même collaborateur devient Manager de l'Administrateur (rôle posé en base pour le test) =====
  const [bob] = await db.select({ id: utilisateur.id }).from(utilisateur).where(eq(utilisateur.email, equipe.emailEmploye));
  await db.update(utilisateur).set({ role: "MANAGER" }).where(eq(utilisateur.id, bob.id));
  await db.update(utilisateur).set({ managerId: bob.id }).where(eq(utilisateur.email, equipe.emailAdmin));
  // Le fondateur n'a pas de fiche RH à l'inscription : on lui en pose une (avec un salaire) pour vérifier que le Manager ne le voit jamais.
  const [alice] = await db.select({ id: utilisateur.id, entrepriseId: utilisateur.entrepriseId }).from(utilisateur).where(eq(utilisateur.email, equipe.emailAdmin));
  await avecEntreprise(alice.entrepriseId, (tx) => tx.insert(dossierRH).values({ entrepriseId: alice.entrepriseId, utilisateurId: alice.id, poste: "Directrice", typeContrat: "CDI", dateEmbauche: new Date("2024-01-01"), salaireBase: 750_000 }));

  // Un Manager peut créer la fiche d'un collaborateur : pas de champ salaire, le rôle est fixé côté serveur.
  await employe.goto("/app/rh/nouveau");
  await expect(employe.getByRole("heading", { name: "Nouvelle fiche collaborateur" })).toBeVisible(ATTENTE);
  await expect(employe.getByLabel("Type de collaborateur")).toBeVisible(ATTENTE);
  await expect(employe.getByLabel("Date de naissance (facultatif)")).toBeVisible(ATTENTE);
  expect(await employe.locator('input[name*="salaire" i], input[id*="salaire" i]').count()).toBe(0);
  await employe.getByLabel("Type de collaborateur").selectOption("PRESTATAIRE");
  await expect(employe.getByLabel("Fin de la mission")).toBeVisible(ATTENTE);
  await expect(employe.getByText("Vous serez le responsable de cette personne.")).toBeVisible(ATTENTE);

  // Sur la fiche d'un membre de son équipe, le Manager voit et peut compléter les informations personnelles, mais JAMAIS le salaire.
  await employe.goto("/app/rh");
  await expect(employe.getByText("Dossiers RH")).toBeVisible(ATTENTE);
  await employe.getByRole("link", { name: /Alice Admin/ }).first().click();
  await expect(employe.getByRole("heading", { name: "Alice Admin" })).toBeVisible(ATTENTE);
  await expect(employe.getByText("Informations personnelles")).toBeVisible(ATTENTE);
  await expect(employe.locator("#telephone")).toBeVisible(ATTENTE);
  await expect(employe.getByText("Salaire de base")).toHaveCount(0);
  await expect(employe.getByText("Historique de salaire")).toHaveCount(0);
});

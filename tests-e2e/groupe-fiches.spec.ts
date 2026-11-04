import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { creerEquipe, supprimerEntrepriseDeTest, type Equipe } from "./aide-equipe";
import { avecEntreprise, db } from "../src/db/client";
import { dossierRH, entreprise, groupe, service, utilisateur } from "../src/db/schema";

// Partage des fiches dans un groupe : réglage par l'Administrateur, liste blanche en lecture seule (jamais le salaire ni l'adresse), anniversaires.
let equipe: Equipe | null = null;
let nomFiliale = "";
test.afterAll(async () => {
  test.setTimeout(300_000);
  if (equipe) {
    await equipe.contexteEmploye.close();
    await supprimerEntrepriseDeTest(equipe.nomEntreprise);
  }
  if (nomFiliale) await supprimerEntrepriseDeTest(nomFiliale);
});

test("Équipes du groupe : réglage et lecture seule", async ({ page, browser }) => {
  test.setTimeout(500_000);
  equipe = await creerEquipe(page, browser, "grp");
  const { admin } = equipe;
  const [alice] = await db.select({ id: utilisateur.id, e: utilisateur.entrepriseId }).from(utilisateur).where(eq(utilisateur.email, equipe.emailAdmin));
  const suffixe = Date.now();
  nomFiliale = `TEST Filiale ${suffixe}`;
  const [g] = await db.insert(groupe).values({ nom: `Groupe ${suffixe}` }).returning({ id: groupe.id });
  const [f] = await db.insert(entreprise).values({ nom: nomFiliale, secteurProfil: "agence", groupeId: g.id, fichesPartageesGroupe: true }).returning({ id: entreprise.id });
  await db.update(entreprise).set({ groupeId: g.id }).where(eq(entreprise.id, alice.e));
  const demain = new Date(Date.now() + 3 * 86_400_000 + 3600_000);
  const naissance = `1992-${String(demain.getUTCMonth() + 1).padStart(2, "0")}-${String(demain.getUTCDate()).padStart(2, "0")}`;
  const [sv] = await avecEntreprise(f.id, (tx) => tx.insert(service).values({ entrepriseId: f.id, nom: "Logistique" }).returning({ id: service.id }));
  for (const [nom, poste, role, naiss] of [["Paul Essomba", "Responsable logistique", "MANAGER", naissance], ["Fatou Njoya", "Assistante comptable", "EMPLOYE", "1997-01-12"]] as const) {
    const [x] = await db.insert(utilisateur).values({ entrepriseId: f.id, email: `fil-${nom.split(" ")[0]}-${suffixe}@vertexone.test`, nomComplet: nom, role, serviceId: sv.id }).returning({ id: utilisateur.id });
    await avecEntreprise(f.id, (tx) => tx.insert(dossierRH).values({ entrepriseId: f.id, utilisateurId: x.id, poste, typeContrat: "CDI", dateEmbauche: new Date("2023-05-02"), salaireBase: 654_321, dateNaissance: naiss, telephone: "699 12 34 56", adresse: "Adresse privée" }));
  }

  await admin.setViewportSize({ width: 1440, height: 1000 });
  await admin.goto("/app/rh/groupe");
  await expect(admin.getByRole("heading", { name: "Équipes du groupe" })).toBeVisible({ timeout: 90_000 });
  // Alice n'a pas encore activé le partage : rien n'apparaît encore.
  await expect(admin.getByText("Aucune fiche partagée pour le moment.")).toBeVisible({ timeout: 60_000 });
  await expect(admin.getByText("Partage activé")).toBeVisible({ timeout: 60_000 }); // la filiale, elle, a activé
  await admin.getByRole("switch").click();
  await expect(admin.getByText("Paul Essomba")).toBeVisible({ timeout: 90_000 });
  await expect(admin.getByText("Fatou Njoya")).toBeVisible({ timeout: 60_000 });
  await expect(admin.getByText("Logistique").first()).toBeVisible({ timeout: 60_000 });
  // Jamais le salaire ni l'adresse.
  const corps = await admin.locator("body").innerText();
  expect(corps).not.toContain("654");
  expect(corps).not.toContain("Adresse privée");
  await admin.goto("/app/rh");
  await expect(admin.getByText("Anniversaires à venir")).toBeVisible({ timeout: 90_000 });
  await expect(admin.getByText(nomFiliale).first()).toBeVisible({ timeout: 60_000 });
});

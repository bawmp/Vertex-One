import { test, expect } from "@playwright/test";
import { creerEquipe, supprimerEntrepriseDeTest, type Equipe } from "./aide-equipe";

// One Chat : canal général, pièce jointe, réaction, fil, recherche, message direct, groupe privé (privé y compris pour
// l'Administrateur). Deux sessions réelles (Alice Admin, Bob Employé) contre la vraie base ; la conversation se met à
// jour par lecture régulière (3 s), d'où les délais d'attente généreux.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const ATTENTE = { timeout: 60_000 };

let equipe: Equipe | undefined;
let nomEntreprise = "";

test.afterAll(async () => {
  await equipe?.contexteEmploye.close();
  if (nomEntreprise) await supprimerEntrepriseDeTest(nomEntreprise);
});

test("One Chat : canal, pièce jointe, réaction, fil, recherche, message direct, groupe privé", async ({ page: alice, browser }) => {
  test.setTimeout(900_000);
  equipe = await creerEquipe(alice, browser, "chat");
  nomEntreprise = equipe.nomEntreprise;
  const bob = equipe.employe;

  // ===== Canal Général : Alice écrit, Bob reçoit sans recharger =====
  await alice.goto("/app/messagerie");
  await bob.goto("/app/messagerie");
  await expect(alice.getByRole("navigation", { name: "Canaux" }).getByText("Général")).toBeVisible(ATTENTE);
  await expect(bob.getByRole("navigation", { name: "Canaux" }).getByText("Général")).toBeVisible(ATTENTE);

  await alice.getByLabel("Votre message").fill("Bonjour l'équipe, réunion à 10h");
  await alice.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(alice.getByText("Bonjour l'équipe, réunion à 10h")).toBeVisible(ATTENTE);
  await expect(bob.getByText("Bonjour l'équipe, réunion à 10h")).toBeVisible(ATTENTE);

  // ===== Pièce jointe : image affichée pour Bob =====
  await bob.locator('input[type="file"]').setInputFiles({ name: "croquis.png", mimeType: "image/png", buffer: PNG });
  await bob.getByLabel("Votre message").fill("Voici le croquis");
  await bob.getByRole("button", { name: "Envoyer le message" }).click();
  const imageAlice = alice.getByRole("img", { name: "croquis.png" });
  await expect(imageAlice).toBeVisible(ATTENTE);
  await expect.poll(() => imageAlice.evaluate((el: HTMLImageElement) => el.naturalWidth), ATTENTE).toBeGreaterThan(0);

  // ===== Réaction d'Alice sur le message de Bob =====
  const messageBob = alice.locator("div", { has: alice.getByText("Voici le croquis") }).filter({ has: alice.getByRole("button", { name: "Réagir", exact: true }) }).last();
  await messageBob.hover();
  await messageBob.getByRole("button", { name: "Réagir", exact: true }).click();
  await alice.getByRole("menuitem", { name: "Réagir avec 👍" }).click();
  await expect(alice.getByRole("button", { name: /^👍 1/ })).toBeVisible(ATTENTE);
  await expect(bob.getByRole("button", { name: /^👍 1/ })).toBeVisible(ATTENTE);

  // ===== Fil de discussion : Bob répond au message d'Alice =====
  const messageAlice = bob.locator("div", { has: bob.getByText("Bonjour l'équipe, réunion à 10h") }).filter({ has: bob.getByRole("button", { name: "Répondre dans un fil" }) }).last();
  await messageAlice.hover();
  await messageAlice.getByRole("button", { name: "Répondre dans un fil" }).click();
  const fil = bob.getByRole("complementary", { name: "Fil de discussion" });
  await fil.getByPlaceholder("Répondre dans le fil…").fill("Je serai là");
  await fil.getByRole("button", { name: "Envoyer la réponse" }).click();
  await expect(fil.getByText("Je serai là")).toBeVisible(ATTENTE);
  await fil.getByRole("button", { name: "Fermer le fil" }).click();

  // ===== Recherche : Alice retrouve le message de Bob =====
  await alice.getByLabel("Rechercher dans les messages").fill("croquis");
  const resultats = alice.getByRole("region", { name: "Résultats de la recherche" });
  await expect(resultats.getByText("Voici le croquis")).toBeVisible(ATTENTE);
  await alice.getByLabel("Rechercher dans les messages").fill("zzz-introuvable-zzz");
  await expect(resultats.getByText("Aucun message ne correspond.")).toBeVisible(ATTENTE);
  await alice.getByRole("button", { name: "Effacer la recherche" }).click();

  // ===== Message direct : visible des deux seuls interlocuteurs =====
  await alice.getByRole("navigation", { name: "Messages directs" }).getByText("Bob Employé").click();
  await alice.waitForURL(/canal=/, ATTENTE); // la redirection vers la conversation directe doit être terminée avant d'écrire
  await expect(alice.getByText("Bob Employé").first()).toBeVisible(ATTENTE);
  await alice.getByLabel("Votre message").fill("Message direct confidentiel");
  await alice.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(alice.getByText("Message direct confidentiel")).toBeVisible(ATTENTE);
  await bob.getByRole("navigation", { name: "Messages directs" }).getByText("Alice Admin").click();
  await bob.waitForURL(/canal=/, ATTENTE);
  await expect(bob.getByText("Message direct confidentiel")).toBeVisible(ATTENTE);

  // ===== Groupe privé : Bob y est invité, puis retiré — il perd aussitôt tout accès =====
  const urlMessageDirect = alice.url();
  await alice.getByRole("button", { name: "Nouveau groupe privé" }).click();
  await alice.getByLabel("Nom du groupe").fill("Direction");
  await alice.getByRole("checkbox", { name: "Bob Employé" }).check();
  await alice.getByRole("button", { name: "Créer le groupe" }).click();
  // L'URL contient déjà un canal (le message direct) : on attend le groupe lui-même avant d'écrire.
  await expect.poll(() => alice.url(), ATTENTE).not.toBe(urlMessageDirect);
  await expect(alice.getByRole("button", { name: "2 membres" })).toBeVisible(ATTENTE);
  const urlGroupe = alice.url();
  await alice.getByLabel("Votre message").fill("Salaires : sujet réservé");
  await alice.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(alice.getByText("Salaires : sujet réservé")).toBeVisible(ATTENTE);

  await bob.goto(urlGroupe);
  await expect(bob.getByText("Salaires : sujet réservé")).toBeVisible(ATTENTE);
  await expect(bob.getByRole("navigation", { name: "Groupes privés" }).getByText("Direction")).toBeVisible(ATTENTE);

  await alice.getByRole("button", { name: "2 membres" }).click();
  await alice.getByRole("button", { name: "Retirer Bob Employé du groupe" }).click();
  await expect(alice.getByRole("button", { name: "1 membre" })).toBeVisible(ATTENTE);

  await bob.goto("/app/messagerie");
  await expect(bob.getByRole("navigation", { name: "Groupes privés" }).getByText("Direction")).toHaveCount(0);
  await bob.goto(urlGroupe);
  await expect(bob.getByText("Salaires : sujet réservé")).toHaveCount(0);
  const reponse = await bob.request.get(`/app/messagerie/messages?canal=${new URL(urlGroupe).searchParams.get("canal")}`);
  expect(await reponse.text()).not.toContain("Salaires : sujet réservé");
});

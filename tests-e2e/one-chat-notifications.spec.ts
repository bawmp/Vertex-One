import { test, expect } from "@playwright/test";
import { MOT_DE_PASSE } from "./aide-equipe";
import { supprimerEntrepriseDeTest } from "../tests/aide-nettoyage";

// One Chat — notifications : réglages de la personne (niveau, son, aperçu), sourdine d'un canal, manifeste et service worker, et
// arrivée d'un message pendant que l'application est visible (le service worker prévient la page). La livraison d'un vrai push
// par le service de Google/Apple/Mozilla ne peut pas être vérifiée ici : elle est couverte par tests/messagerie-push.test.ts
// (destinataires) et tests/sw-notifications.test.ts (comportement du service worker).
const ATTENTE = { timeout: 60_000 };

let nomEntreprise = "";

test.afterAll(async () => {
  if (nomEntreprise) await supprimerEntrepriseDeTest(nomEntreprise);
});

test("One Chat : réglages de notification, sourdine, manifeste et service worker", async ({ page: alice, context }) => {
  test.setTimeout(300_000);
  // Une entreprise de test avec un seul Administrateur (inscription réelle).
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  nomEntreprise = `TEST notif ${suffixe}`;
  await alice.goto("/inscription");
  await alice.fill("#nomEntreprise", nomEntreprise);
  await alice.getByRole("radio", { name: "Agence" }).click();
  await alice.fill("#nomComplet", "Alice Admin");
  await alice.fill("#email", `notif-admin-${suffixe}@vertexone.test`);
  await alice.fill("#motDePasse", MOT_DE_PASSE);
  await alice.click('button[type="submit"]');
  await alice.waitForURL("/app", { timeout: 120_000 });

  // ===== Manifeste et service worker servis =====
  const manifeste = await alice.request.get("/manifest.webmanifest");
  expect(manifeste.ok()).toBe(true);
  const json = await manifeste.json();
  expect(json.name).toBe("Vertex One");
  expect(json.display).toBe("standalone");
  const sw = await alice.request.get("/sw.js");
  expect(sw.ok()).toBe(true);
  expect(sw.headers()["content-type"]).toContain("javascript");

  // ===== Réglages : le niveau, le son et l'aperçu sont enregistrés et retrouvés =====
  await alice.goto("/app/messagerie");
  await alice.getByText("Mes notifications", { exact: true }).click();
  await expect(alice.getByRole("radio", { name: /Messages privés et mentions/ })).toBeChecked(ATTENTE); // niveau par défaut
  await alice.getByRole("radio", { name: /Tous les messages/ }).check();
  await expect(alice.getByText("Enregistré", { exact: true })).toBeVisible(ATTENTE);
  await alice.getByLabel("Jouer un son à l'arrivée d'un message").uncheck();
  await alice.getByLabel("Afficher le texte du message dans la notification").uncheck();
  await expect(alice.getByText("Enregistré", { exact: true })).toBeVisible(ATTENTE);

  await alice.reload();
  await alice.getByText("Mes notifications", { exact: true }).click();
  await expect(alice.getByRole("radio", { name: /Tous les messages/ })).toBeChecked(ATTENTE);
  await expect(alice.getByLabel("Jouer un son à l'arrivée d'un message")).not.toBeChecked();
  await expect(alice.getByLabel("Afficher le texte du message dans la notification")).not.toBeChecked();
  // La clé VAPID est configurée : le bouton d'activation sur cet appareil est proposé.
  await expect(alice.getByRole("button", { name: "Activer sur cet appareil" })).toBeVisible();

  // ===== Sourdine d'un canal =====
  await alice.getByRole("button", { name: "Mettre en sourdine" }).click();
  await expect(alice.getByRole("button", { name: "Sourdine activée" })).toBeVisible(ATTENTE);
  await alice.reload();
  await expect(alice.getByRole("button", { name: "Sourdine activée" })).toBeVisible(ATTENTE);
  await alice.getByRole("button", { name: "Sourdine activée" }).click();
  await expect(alice.getByRole("button", { name: "Mettre en sourdine" })).toBeVisible(ATTENTE);

  // ===== Service worker : un push reçu application visible prévient la page (pas de notification système) =====
  await context.grantPermissions(["notifications"]);
  const cdp = await context.newCDPSession(alice);
  await cdp.send("ServiceWorker.enable");
  let registrationId = "";
  cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => {
    if (e.registrations[0]) registrationId = e.registrations[0].registrationId;
  });
  await alice.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    (window as unknown as { __recus: number }).__recus = 0;
    window.addEventListener("one-chat:nouveau-message", () => ((window as unknown as { __recus: number }).__recus += 1));
  });
  await expect.poll(() => registrationId, ATTENTE).not.toBe("");
  await cdp.send("ServiceWorker.deliverPushMessage", {
    origin: new URL(alice.url()).origin,
    registrationId,
    data: JSON.stringify({ titre: "Bob Employé", corps: "Salut", url: "/app/messagerie", tag: "one-chat-test", son: false, canalId: "c", messageId: "m" }),
  });
  await expect.poll(() => alice.evaluate(() => (window as unknown as { __recus: number }).__recus), ATTENTE).toBe(1);
  const nbNotifications = await alice.evaluate(async () => (await (await navigator.serviceWorker.getRegistration("/"))!.getNotifications()).length);
  expect(nbNotifications).toBe(0);
});

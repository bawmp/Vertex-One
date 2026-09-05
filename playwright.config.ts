import { defineConfig } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  testDir: "./tests-e2e",
  fullyParallel: false,
  // 30s (défaut) est trop juste pour des parcours multi-écrans contre une
  // vraie base : première visite de chaque route (compilation Turbopack à
  // froid) + plusieurs transactions Neon réelles peuvent dépasser ce budget
  // sans qu'il y ait de bug — confirmé en isolant chaque étape.
  timeout: 60_000,
  // Le défaut (5s) est systématiquement trop court : une Server Action
  // suivie d'un re-rendu (ex: "Envoyer au client") prend régulièrement 5 à
  // 8s de bout en bout sous la latence Neon documentée dans CLAUDE.md — pas
  // un cas limite, le comportement observé en pratique sur presque tous les
  // tests. Sans ce réglage, expect().toBeVisible() abandonne et coupe la
  // requête en cours (voir l'erreur serveur "destination stream closed
  // early" laissée par un abandon prématuré), alors que l'action serveur
  // avait réussi.
  expect: { timeout: 15_000 },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 30_000,
  },
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});

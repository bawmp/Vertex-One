import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.test.ts"], // exclut tests-e2e/ (specs Playwright, pas Vitest)
    // Défaut (5s) trop court pour des tests contre une vraie base Neon,
    // surtout avec des transactions concurrentes réelles (voir CLAUDE.md,
    // latence de connexion) — un timeout dépassé n'annule pas les promesses
    // JS en vol, ce qui a produit un résultat incohérent entre deux tests
    // qui partagent un compteur, avant ce correctif.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

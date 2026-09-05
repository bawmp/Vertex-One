import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Rôle propriétaire (droits DDL), jamais DATABASE_URL (rôle applicatif
    // restreint, sans droits de modification de schéma) — voir CLAUDE.md.
    url: process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL!,
  },
});

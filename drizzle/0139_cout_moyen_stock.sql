ALTER TABLE "produit" ADD COLUMN IF NOT EXISTS "cout_moyen" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "produit" SET "cout_moyen" = "prix_achat" WHERE "suivi_stock" = true AND "cout_moyen" = 0;--> statement-breakpoint
INSERT INTO "compte_comptable" ("id", "numero", "libelle", "classe") SELECT 'syscohada-603000', '603000', 'Variations des stocks de biens achetés', 6 WHERE NOT EXISTS (SELECT 1 FROM "compte_comptable" WHERE "numero" = '603000' AND "entreprise_id" IS NULL);

ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "gere_stock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "entreprise" e SET "gere_stock" = true WHERE EXISTS (SELECT 1 FROM "produit" p WHERE p."entreprise_id" = e."id" AND p."suivi_stock" = true);

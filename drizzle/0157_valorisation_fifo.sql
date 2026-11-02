ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "methode_valorisation" text DEFAULT 'CMUP' NOT NULL;--> statement-breakpoint
ALTER TABLE "mouvement_stock" ADD COLUMN IF NOT EXISTS "cout_unitaire" integer;

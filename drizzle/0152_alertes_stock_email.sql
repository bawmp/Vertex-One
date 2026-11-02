ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "alertes_stock_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "produit" ADD COLUMN IF NOT EXISTS "alerte_stock_niveau" text;

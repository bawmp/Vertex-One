ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "souhait_anniversaire_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "produit" ADD COLUMN IF NOT EXISTS "duree_garantie_mois" integer;--> statement-breakpoint
ALTER TABLE "numero_serie" ADD COLUMN IF NOT EXISTS "garantie_fin" text;

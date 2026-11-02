ALTER TABLE "produit" ADD COLUMN IF NOT EXISTS "stock_cible" integer;--> statement-breakpoint
ALTER TABLE "produit" ADD COLUMN IF NOT EXISTS "fournisseur_habituel_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "produit" ADD CONSTRAINT "produit_fournisseur_habituel_id_fk" FOREIGN KEY ("fournisseur_habituel_id") REFERENCES "public"."fournisseur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

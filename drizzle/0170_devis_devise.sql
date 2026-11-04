ALTER TABLE "devis" ADD COLUMN IF NOT EXISTS "devise" text;--> statement-breakpoint
ALTER TABLE "devis" ADD COLUMN IF NOT EXISTS "montant_devise_centimes" integer;--> statement-breakpoint
ALTER TABLE "devis" ADD COLUMN IF NOT EXISTS "taux_change_milliemes" integer;

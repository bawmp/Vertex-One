ALTER TABLE "facture" ADD COLUMN IF NOT EXISTS "devise" text;--> statement-breakpoint
ALTER TABLE "facture" ADD COLUMN IF NOT EXISTS "montant_devise_centimes" integer;--> statement-breakpoint
ALTER TABLE "facture" ADD COLUMN IF NOT EXISTS "taux_change_milliemes" integer;

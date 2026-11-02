ALTER TABLE "produit" ADD COLUMN IF NOT EXISTS "code_barres" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "produit_code_barres_unique" ON "produit" USING btree ("entreprise_id","code_barres") WHERE "produit"."code_barres" is not null;

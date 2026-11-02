ALTER TABLE "ecriture_comptable" ADD COLUMN IF NOT EXISTS "contrepasse_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ecriture_comptable_contrepasse_unique" ON "ecriture_comptable" USING btree ("contrepasse_id") WHERE "ecriture_comptable"."contrepasse_id" IS NOT NULL;

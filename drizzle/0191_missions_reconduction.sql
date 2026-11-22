ALTER TABLE "mission" ADD COLUMN IF NOT EXISTS "reconduction" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mission" ADD COLUMN IF NOT EXISTS "precedente_id" text;--> statement-breakpoint
ALTER TABLE "mission" ADD COLUMN IF NOT EXISTS "suivante_creee_le" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_reconduction_idx" ON "mission" USING btree ("entreprise_id") WHERE "mission"."reconduction" = true;

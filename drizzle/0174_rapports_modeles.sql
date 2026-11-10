ALTER TABLE "rapport_hierarchique" ADD COLUMN IF NOT EXISTS "modele" text;--> statement-breakpoint
ALTER TABLE "rapport_hierarchique" ADD COLUMN IF NOT EXISTS "sections" json;

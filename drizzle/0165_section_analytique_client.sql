ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "section_analytique_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact" ADD CONSTRAINT "contact_section_analytique_id_fk" FOREIGN KEY ("section_analytique_id") REFERENCES "public"."section_analytique"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

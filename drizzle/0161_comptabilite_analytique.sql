CREATE TABLE IF NOT EXISTS "section_analytique" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"axe" text DEFAULT 'AUTRE' NOT NULL,
	"code" text NOT NULL,
	"libelle" text NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "section_analytique" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "section_analytique" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "section_analytique" AS PERMISSIVE FOR ALL TO public USING ("section_analytique"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("section_analytique"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "section_analytique" ADD CONSTRAINT "section_analytique_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "section_analytique_entreprise_code_unique" ON "section_analytique" USING btree ("entreprise_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "section_analytique_entreprise_idx" ON "section_analytique" USING btree ("entreprise_id");--> statement-breakpoint
ALTER TABLE "ecriture_comptable" ADD COLUMN IF NOT EXISTS "section_analytique_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ecriture_comptable" ADD CONSTRAINT "ecriture_comptable_section_analytique_id_fk" FOREIGN KEY ("section_analytique_id") REFERENCES "public"."section_analytique"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ecriture_comptable_section_idx" ON "ecriture_comptable" USING btree ("section_analytique_id");

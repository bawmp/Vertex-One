CREATE TABLE IF NOT EXISTS "cloture_exercice" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"annee" integer NOT NULL,
	"date_cloture" timestamp NOT NULL,
	"resultat_net" integer NOT NULL,
	"journal_manuel_id" text,
	"cloture_par" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "cloture_exercice" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cloture_exercice" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cloture_exercice" ADD CONSTRAINT "cloture_exercice_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cloture_exercice" ADD CONSTRAINT "cloture_exercice_cloture_par_fk" FOREIGN KEY ("cloture_par") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cloture_exercice_entreprise_annee_unique" ON "cloture_exercice" USING btree ("entreprise_id","annee");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloture_exercice_entreprise_idx" ON "cloture_exercice" USING btree ("entreprise_id");--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "cloture_exercice" AS PERMISSIVE FOR ALL TO public USING ("cloture_exercice"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("cloture_exercice"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;

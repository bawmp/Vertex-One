CREATE TABLE IF NOT EXISTS "mission" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"utilisateur_id" text NOT NULL,
	"titre" text NOT NULL,
	"description" text,
	"resultat_attendu" text,
	"horizon" text NOT NULL,
	"date_debut" text NOT NULL,
	"date_fin" text,
	"statut" text DEFAULT 'EN_COURS' NOT NULL,
	"avancement" integer DEFAULT 0 NOT NULL,
	"note_suivi" text,
	"suivi_le" timestamp,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"terminee_le" timestamp
);--> statement-breakpoint
ALTER TABLE "mission" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mission" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "mission" AS PERMISSIVE FOR ALL TO public USING ("mission"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("mission"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mission" ADD CONSTRAINT "mission_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mission" ADD CONSTRAINT "mission_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mission" ADD CONSTRAINT "mission_cree_par_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_entreprise_idx" ON "mission" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_utilisateur_idx" ON "mission" USING btree ("utilisateur_id");

CREATE TABLE IF NOT EXISTS "tache_poste" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"utilisateur_id" text NOT NULL,
	"titre" text NOT NULL,
	"description" text,
	"frequence" text DEFAULT 'PERMANENTE' NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "tache_poste" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tache_poste" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "tache_poste" AS PERMISSIVE FOR ALL TO public USING ("tache_poste"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("tache_poste"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tache_poste" ADD CONSTRAINT "tache_poste_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tache_poste" ADD CONSTRAINT "tache_poste_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tache_poste" ADD CONSTRAINT "tache_poste_cree_par_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tache_poste_entreprise_idx" ON "tache_poste" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tache_poste_utilisateur_idx" ON "tache_poste" USING btree ("utilisateur_id");

-- Fiches ouvertes aux entreprises d'un groupe + trace des modifications faites par une autre entreprise (2026-11-11).
ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "fiches_ouvertes_a" json DEFAULT '[]'::json NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "modification_fiche_partagee" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"cible_type" text NOT NULL,
	"cible_id" text NOT NULL,
	"auteur_id" text NOT NULL,
	"auteur_nom" text NOT NULL,
	"auteur_entreprise_id" text NOT NULL,
	"auteur_entreprise_nom" text NOT NULL,
	"champs" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "modification_fiche_partagee" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "modification_fiche_partagee" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "modification_fiche_partagee" AS PERMISSIVE FOR ALL TO public USING ("modification_fiche_partagee"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("modification_fiche_partagee"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "modification_fiche_partagee" ADD CONSTRAINT "modification_fiche_partagee_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "modification_fiche_partagee" ADD CONSTRAINT "modification_fiche_partagee_auteur_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "modification_fiche_partagee_entreprise_idx" ON "modification_fiche_partagee" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "modification_fiche_partagee_cible_idx" ON "modification_fiche_partagee" USING btree ("cible_id");

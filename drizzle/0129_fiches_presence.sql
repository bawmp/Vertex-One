-- Fiches de présence journalières (2026-10-27) : gérant de la fiche et réglage de partage dans le groupe (entreprise), remarque et auteur de saisie
-- (pointage), entreprises jointes à une fiche (jonction_presence) et validation d'un jour (validation_presence). Nouvelles tables de données :
-- entreprise_id + RLS + FORCE dès la création. Rejouable.
ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "gerant_presences_id" text;--> statement-breakpoint
ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "presences_partagees_groupe" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pointage" ADD COLUMN IF NOT EXISTS "remarque" text;--> statement-breakpoint
ALTER TABLE "pointage" ADD COLUMN IF NOT EXISTS "saisi_par_id" text;--> statement-breakpoint
ALTER TABLE "pointage" ADD COLUMN IF NOT EXISTS "saisi_le" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pointage" ADD CONSTRAINT "pointage_saisi_par_id_utilisateur_id_fk" FOREIGN KEY ("saisi_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jonction_presence" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"partenaire_id" text NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "jonction_presence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "jonction_presence" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jonction_presence" ADD CONSTRAINT "jonction_presence_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jonction_presence" ADD CONSTRAINT "jonction_presence_partenaire_id_fk" FOREIGN KEY ("partenaire_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jonction_presence" ADD CONSTRAINT "jonction_presence_cree_par_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "jonction_presence_unique" ON "jonction_presence" USING btree ("entreprise_id","partenaire_id");--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise" ON "jonction_presence";--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "jonction_presence" AS PERMISSIVE FOR ALL TO public USING ("jonction_presence"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("jonction_presence"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "validation_presence" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"validee_par_id" text NOT NULL,
	"validee_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "validation_presence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "validation_presence" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "validation_presence" ADD CONSTRAINT "validation_presence_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "validation_presence" ADD CONSTRAINT "validation_presence_validee_par_id_fk" FOREIGN KEY ("validee_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "validation_presence_jour_unique" ON "validation_presence" USING btree ("entreprise_id","date");--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise" ON "validation_presence";--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "validation_presence" AS PERMISSIVE FOR ALL TO public USING ("validation_presence"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("validation_presence"."entreprise_id" = current_setting('app.entreprise_id', true));

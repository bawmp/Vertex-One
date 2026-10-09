-- Clés d'API d'entreprise + origine externe d'un lead (2026-10-09). Permet à un site externe (ex. Global Mobility) de
-- créer des leads dans le CRM de son entreprise. Nouvelle table de données : entreprise_id + RLS + FORCE dès la
-- création. Lecture anonyme par empreinte (comme invitation) ; écriture toujours stricte. Rejouable sans erreur.
ALTER TABLE "lead" ADD COLUMN IF NOT EXISTS "source_externe" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN IF NOT EXISTS "reference_externe" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_reference_externe_unique" ON "lead" USING btree ("entreprise_id","source_externe","reference_externe") WHERE "lead"."reference_externe" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cle_api_entreprise" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"prefixe" text NOT NULL,
	"empreinte" text NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"dernier_usage_le" timestamp,
	"revoquee_le" timestamp,
	CONSTRAINT "cle_api_entreprise_empreinte_unique" UNIQUE("empreinte")
);--> statement-breakpoint
ALTER TABLE "cle_api_entreprise" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cle_api_entreprise" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cle_api_entreprise" ADD CONSTRAINT "cle_api_entreprise_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cle_api_entreprise" ADD CONSTRAINT "cle_api_entreprise_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cle_api_entreprise_entreprise_idx" ON "cle_api_entreprise" USING btree ("entreprise_id");--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise_lecture" ON "cle_api_entreprise";--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise_ecriture" ON "cle_api_entreprise";--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise_modification" ON "cle_api_entreprise";--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise_suppression" ON "cle_api_entreprise";--> statement-breakpoint
CREATE POLICY "isolation_entreprise_lecture" ON "cle_api_entreprise" AS PERMISSIVE FOR SELECT TO public USING ("cle_api_entreprise"."entreprise_id" = current_setting('app.entreprise_id', true) OR nullif(current_setting('app.entreprise_id', true), '') IS NULL);--> statement-breakpoint
CREATE POLICY "isolation_entreprise_ecriture" ON "cle_api_entreprise" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("cle_api_entreprise"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise_modification" ON "cle_api_entreprise" AS PERMISSIVE FOR UPDATE TO public USING ("cle_api_entreprise"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("cle_api_entreprise"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise_suppression" ON "cle_api_entreprise" AS PERMISSIVE FOR DELETE TO public USING ("cle_api_entreprise"."entreprise_id" = current_setting('app.entreprise_id', true));

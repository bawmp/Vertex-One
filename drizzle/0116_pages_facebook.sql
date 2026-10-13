-- Pages Facebook reliées à une entreprise (2026-10-13) : les prospects des publicités à formulaire deviennent des leads.
-- Deux nouvelles tables de données : entreprise_id + RLS + FORCE dès la création. `connexion_facebook` est strictement
-- isolée (elle porte le jeton chiffré de la page) ; `routage_facebook_page` n'expose qu'« entreprise ↔ page » en lecture
-- anonyme (le webhook de Meta n'a pas de session), jamais en écriture. Rejouable sans erreur.
CREATE TABLE IF NOT EXISTS "connexion_facebook" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"page_id" text NOT NULL,
	"page_nom" text NOT NULL,
	"jeton_chiffre" text NOT NULL,
	"connecte_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"dernier_lead_le" timestamp
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "routage_facebook_page" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"page_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connexion_facebook" ADD CONSTRAINT "connexion_facebook_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connexion_facebook" ADD CONSTRAINT "connexion_facebook_connecte_par_id_fk" FOREIGN KEY ("connecte_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "routage_facebook_page" ADD CONSTRAINT "routage_facebook_page_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connexion_facebook_page_unique" ON "connexion_facebook" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connexion_facebook_entreprise_idx" ON "connexion_facebook" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "routage_facebook_page_unique" ON "routage_facebook_page" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "routage_facebook_page_entreprise_idx" ON "routage_facebook_page" USING btree ("entreprise_id");--> statement-breakpoint
ALTER TABLE "connexion_facebook" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "connexion_facebook" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise_lecture" ON "connexion_facebook";--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise_ecriture" ON "connexion_facebook";--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise_modification" ON "connexion_facebook";--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise_suppression" ON "connexion_facebook";--> statement-breakpoint
CREATE POLICY "isolation_entreprise_lecture" ON "connexion_facebook" AS PERMISSIVE FOR SELECT TO public USING ("connexion_facebook"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise_ecriture" ON "connexion_facebook" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("connexion_facebook"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise_modification" ON "connexion_facebook" AS PERMISSIVE FOR UPDATE TO public USING ("connexion_facebook"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("connexion_facebook"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise_suppression" ON "connexion_facebook" AS PERMISSIVE FOR DELETE TO public USING ("connexion_facebook"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
ALTER TABLE "routage_facebook_page" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "routage_facebook_page" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise_lecture" ON "routage_facebook_page";--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise_ecriture" ON "routage_facebook_page";--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise_modification" ON "routage_facebook_page";--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise_suppression" ON "routage_facebook_page";--> statement-breakpoint
CREATE POLICY "isolation_entreprise_lecture" ON "routage_facebook_page" AS PERMISSIVE FOR SELECT TO public USING ("routage_facebook_page"."entreprise_id" = current_setting('app.entreprise_id', true) OR nullif(current_setting('app.entreprise_id', true), '') IS NULL);--> statement-breakpoint
CREATE POLICY "isolation_entreprise_ecriture" ON "routage_facebook_page" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("routage_facebook_page"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise_modification" ON "routage_facebook_page" AS PERMISSIVE FOR UPDATE TO public USING ("routage_facebook_page"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("routage_facebook_page"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise_suppression" ON "routage_facebook_page" AS PERMISSIVE FOR DELETE TO public USING ("routage_facebook_page"."entreprise_id" = current_setting('app.entreprise_id', true));

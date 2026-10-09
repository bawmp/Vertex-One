-- Journal des exports de données (2026-10-09) : trace de chaque téléchargement d'un export (qui, quoi, combien de lignes),
-- jamais le contenu exporté. Nouvelle table de données : entreprise_id + RLS + FORCE dès la création. Rejouable.
CREATE TABLE IF NOT EXISTS "journal_export_donnees" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"utilisateur_id" text NOT NULL,
	"type" text NOT NULL,
	"nombre_lignes" integer NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "journal_export_donnees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "journal_export_donnees" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_export_donnees" ADD CONSTRAINT "journal_export_donnees_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_export_donnees" ADD CONSTRAINT "journal_export_donnees_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_export_donnees_entreprise_idx" ON "journal_export_donnees" USING btree ("entreprise_id");--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise" ON "journal_export_donnees";--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "journal_export_donnees" AS PERMISSIVE FOR ALL TO public USING ("journal_export_donnees"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("journal_export_donnees"."entreprise_id" = current_setting('app.entreprise_id', true));

-- Documents rédigés dans Vertex One (2026-10-22) : éditeur de documents avec en-tête, pied de page et numéros, export PDF et Word.
-- Nouvelle table de données : entreprise_id + RLS + FORCE dès la création. Rejouable sans erreur.
CREATE TABLE IF NOT EXISTS "document_redige" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"titre" text NOT NULL,
	"contenu" json NOT NULL,
	"mise_en_page" json NOT NULL,
	"assigne_a_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"modifie_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "document_redige" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_redige" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_redige" ADD CONSTRAINT "document_redige_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_redige" ADD CONSTRAINT "document_redige_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_redige_entreprise_idx" ON "document_redige" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_redige_assigne_idx" ON "document_redige" USING btree ("assigne_a_id");--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise" ON "document_redige";--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "document_redige" AS PERMISSIVE FOR ALL TO public USING ("document_redige"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("document_redige"."entreprise_id" = current_setting('app.entreprise_id', true));

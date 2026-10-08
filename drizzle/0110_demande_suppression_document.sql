-- Demande de suppression d'un document (2026-10-08) : quelqu'un qui n'a pas ajouté un document peut en demander la
-- suppression ; elle n'est effective qu'après validation de l'Administrateur, qui voit qui l'a demandée.
-- Nouvelle table de données : entreprise_id + RLS + FORCE dès la création. Rejouable sans erreur.
CREATE TABLE IF NOT EXISTS "demande_suppression_document" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"document_id" text NOT NULL,
	"document_nom" text NOT NULL,
	"demande_par_id" text NOT NULL,
	"motif" text,
	"statut" text DEFAULT 'EN_ATTENTE' NOT NULL,
	"traite_par_id" text,
	"traite_le" timestamp,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "demande_suppression_document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "demande_suppression_document" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demande_suppression_document" ADD CONSTRAINT "demande_suppression_document_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demande_suppression_document" ADD CONSTRAINT "demande_suppression_document_demande_par_id_utilisateur_id_fk" FOREIGN KEY ("demande_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demande_suppression_document" ADD CONSTRAINT "demande_suppression_document_traite_par_id_utilisateur_id_fk" FOREIGN KEY ("traite_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "demande_suppression_document_entreprise_idx" ON "demande_suppression_document" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "demande_suppression_document_document_idx" ON "demande_suppression_document" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "demande_suppression_document_attente_unique" ON "demande_suppression_document" USING btree ("document_id") WHERE "demande_suppression_document"."statut" = 'EN_ATTENTE';--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise" ON "demande_suppression_document";--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "demande_suppression_document" AS PERMISSIVE FOR ALL TO public USING ("demande_suppression_document"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("demande_suppression_document"."entreprise_id" = current_setting('app.entreprise_id', true));

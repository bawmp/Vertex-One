-- Stagiaires (2026-10-27) : (1) décision de fin de stage d'un stagiaire PROFESSIONNEL (un employé de contrat STAGE en période probatoire) sur son
-- dossier RH ; (2) fiche d'un stagiaire ACADÉMIQUE (sans compte). Nouvelle table de données : entreprise_id + RLS + FORCE dès la création. Rejouable.
ALTER TABLE "dossier_rh" ADD COLUMN IF NOT EXISTS "decision_stage" text;--> statement-breakpoint
ALTER TABLE "dossier_rh" ADD COLUMN IF NOT EXISTS "date_decision_stage" timestamp;--> statement-breakpoint
ALTER TABLE "dossier_rh" ADD COLUMN IF NOT EXISTS "motif_decision_stage" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stagiaire_academique" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"telephone" text,
	"email" text,
	"etablissement" text NOT NULL,
	"filiere" text,
	"niveau" text,
	"tuteur_ecole_nom" text,
	"tuteur_ecole_contact" text,
	"convention_reference" text,
	"mission" text,
	"service_id" text,
	"maitre_stage_id" text,
	"date_debut" timestamp NOT NULL,
	"date_fin" timestamp NOT NULL,
	"indemnite_mensuelle" integer,
	"evaluation" text,
	"statut" text DEFAULT 'EN_COURS' NOT NULL,
	"decision_le" timestamp,
	"motif_decision" text,
	"invitation_id" text,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "stagiaire_academique" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stagiaire_academique" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stagiaire_academique" ADD CONSTRAINT "stagiaire_academique_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stagiaire_academique" ADD CONSTRAINT "stagiaire_academique_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stagiaire_academique" ADD CONSTRAINT "stagiaire_academique_maitre_stage_id_fk" FOREIGN KEY ("maitre_stage_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stagiaire_academique" ADD CONSTRAINT "stagiaire_academique_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitation"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stagiaire_academique" ADD CONSTRAINT "stagiaire_academique_cree_par_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stagiaire_academique_entreprise_idx" ON "stagiaire_academique" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stagiaire_academique_maitre_idx" ON "stagiaire_academique" USING btree ("maitre_stage_id");--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise" ON "stagiaire_academique";--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "stagiaire_academique" AS PERMISSIVE FOR ALL TO public USING ("stagiaire_academique"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("stagiaire_academique"."entreprise_id" = current_setting('app.entreprise_id', true));

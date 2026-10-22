-- Souche des emails envoyés (2026-10-22) : copie de chaque email envoyé à un client (destinataire, objet, corps, noms des pièces jointes).
-- Nouvelle table de données : entreprise_id + RLS + FORCE dès la création. Rejouable sans erreur.
CREATE TABLE IF NOT EXISTS "email_envoye" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"contact_id" text,
	"auteur_id" text,
	"destinataire" text NOT NULL,
	"sujet" text NOT NULL,
	"corps_html" text NOT NULL,
	"pieces_jointes" json DEFAULT '[]'::json NOT NULL,
	"type" text DEFAULT 'EMAIL' NOT NULL,
	"envoye_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "email_envoye" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_envoye" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_envoye" ADD CONSTRAINT "email_envoye_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_envoye" ADD CONSTRAINT "email_envoye_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_envoye" ADD CONSTRAINT "email_envoye_auteur_id_utilisateur_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_envoye_entreprise_idx" ON "email_envoye" USING btree ("entreprise_id","envoye_le");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_envoye_contact_idx" ON "email_envoye" USING btree ("contact_id");--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise" ON "email_envoye";--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "email_envoye" AS PERMISSIVE FOR ALL TO public USING ("email_envoye"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("email_envoye"."entreprise_id" = current_setting('app.entreprise_id', true));

-- Champs personnalisés du Contact (2026-09-29) : deux nouvelles tables (RLS + FORCE), aucune colonne existante
-- modifiée. Écrite à la main : drizzle-kit generate ne peut pas s'exécuter dans ce shell non interactif (il
-- demande de confirmer que le nouvel enum type_champ_contact n'est pas un renommage de type_champ_formulaire).
-- Rejouable sans erreur.
CREATE TYPE "public"."type_champ_contact" AS ENUM('TEXTE_COURT', 'TEXTE_LONG', 'NOMBRE', 'DATE', 'EMAIL', 'TELEPHONE', 'CASE_A_COCHER', 'LISTE_DEROULANTE');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_champ_personnalise" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"libelle" text NOT NULL,
	"type" "type_champ_contact" NOT NULL,
	"obligatoire" boolean DEFAULT false NOT NULL,
	"options" json,
	"ordre" integer DEFAULT 0 NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_champ_valeur" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"champ_id" text NOT NULL,
	"valeur" text NOT NULL
);--> statement-breakpoint
ALTER TABLE "contact_champ_personnalise" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_champ_personnalise" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_champ_valeur" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_champ_valeur" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_champ_personnalise" ADD CONSTRAINT "contact_champ_personnalise_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_champ_valeur" ADD CONSTRAINT "contact_champ_valeur_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_champ_valeur" ADD CONSTRAINT "contact_champ_valeur_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_champ_valeur" ADD CONSTRAINT "contact_champ_valeur_champ_id_contact_champ_personnalise_id_fk" FOREIGN KEY ("champ_id") REFERENCES "public"."contact_champ_personnalise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_champ_personnalise_entreprise_idx" ON "contact_champ_personnalise" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_champ_valeur_entreprise_idx" ON "contact_champ_valeur" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_champ_valeur_contact_idx" ON "contact_champ_valeur" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contact_champ_valeur_contact_champ_unique" ON "contact_champ_valeur" USING btree ("contact_id","champ_id");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "contact_champ_personnalise" AS PERMISSIVE FOR ALL TO public USING ("contact_champ_personnalise"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("contact_champ_personnalise"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "contact_champ_valeur" AS PERMISSIVE FOR ALL TO public USING ("contact_champ_valeur"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("contact_champ_valeur"."entreprise_id" = current_setting('app.entreprise_id', true));

-- Primes et paiements de salaire (bulletin de paie simple, sans cotisations) — 2026-11-11.
CREATE TABLE IF NOT EXISTS "prime" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"dossier_rh_id" text NOT NULL,
	"type" text NOT NULL,
	"montant" integer NOT NULL,
	"mois_concerne" text NOT NULL,
	"motif" text,
	"saisie_par_id" text NOT NULL,
	"paiement_salaire_id" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "paiement_salaire" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"dossier_rh_id" text NOT NULL,
	"mois" text NOT NULL,
	"salaire_base" integer NOT NULL,
	"primes" json NOT NULL,
	"total_primes" integer NOT NULL,
	"retenues" json NOT NULL,
	"total_retenues" integer NOT NULL,
	"net" integer NOT NULL,
	"date_paiement" text NOT NULL,
	"mode_paiement" text NOT NULL,
	"paye_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "prime" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prime" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "paiement_salaire" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "paiement_salaire" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "prime" AS PERMISSIVE FOR ALL TO public USING ("prime"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("prime"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "paiement_salaire" AS PERMISSIVE FOR ALL TO public USING ("paiement_salaire"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("paiement_salaire"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prime" ADD CONSTRAINT "prime_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prime" ADD CONSTRAINT "prime_dossier_rh_id_fk" FOREIGN KEY ("dossier_rh_id") REFERENCES "public"."dossier_rh"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prime" ADD CONSTRAINT "prime_saisie_par_id_fk" FOREIGN KEY ("saisie_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "paiement_salaire" ADD CONSTRAINT "paiement_salaire_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "paiement_salaire" ADD CONSTRAINT "paiement_salaire_dossier_rh_id_fk" FOREIGN KEY ("dossier_rh_id") REFERENCES "public"."dossier_rh"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "paiement_salaire" ADD CONSTRAINT "paiement_salaire_paye_par_id_fk" FOREIGN KEY ("paye_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prime_entreprise_idx" ON "prime" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prime_dossier_rh_idx" ON "prime" USING btree ("dossier_rh_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "paiement_salaire_entreprise_idx" ON "paiement_salaire" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "paiement_salaire_dossier_mois_unique" ON "paiement_salaire" USING btree ("dossier_rh_id","mois");

DO $$ BEGIN
 CREATE TYPE "public"."statut_promesse_paiement" AS ENUM('EN_COURS', 'TENUE', 'NON_TENUE', 'ANNULEE');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promesse_paiement" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"facture_id" text NOT NULL,
	"contact_id" text,
	"date_promise" date NOT NULL,
	"montant" integer NOT NULL,
	"canal" text NOT NULL,
	"source" text DEFAULT 'EQUIPE' NOT NULL,
	"note" text,
	"statut" "statut_promesse_paiement" DEFAULT 'EN_COURS' NOT NULL,
	"cree_par_id" text,
	"client_ip" text,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"resolue_le" timestamp,
	"alerte_le" timestamp
);--> statement-breakpoint
ALTER TABLE "promesse_paiement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "promesse_paiement" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "promesse_paiement" ADD CONSTRAINT "promesse_paiement_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "promesse_paiement" ADD CONSTRAINT "promesse_paiement_facture_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."facture"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "promesse_paiement" ADD CONSTRAINT "promesse_paiement_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "promesse_paiement" ADD CONSTRAINT "promesse_paiement_cree_par_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promesse_paiement_entreprise_idx" ON "promesse_paiement" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promesse_paiement_facture_idx" ON "promesse_paiement" USING btree ("facture_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promesse_paiement_statut_date_idx" ON "promesse_paiement" USING btree ("statut","date_promise");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "promesse_paiement_en_cours_unique" ON "promesse_paiement" USING btree ("facture_id") WHERE "promesse_paiement"."statut" = 'EN_COURS';--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "promesse_paiement" AS PERMISSIVE FOR ALL TO public USING ("promesse_paiement"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("promesse_paiement"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;

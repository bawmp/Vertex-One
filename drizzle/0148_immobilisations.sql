CREATE TABLE IF NOT EXISTS "immobilisation" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"libelle" text NOT NULL,
	"compte_actif" text NOT NULL,
	"date_acquisition" timestamp NOT NULL,
	"valeur_acquisition" integer NOT NULL,
	"valeur_residuelle" integer DEFAULT 0 NOT NULL,
	"duree_annees" integer NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dotation_amortissement" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"immobilisation_id" text NOT NULL,
	"annee" integer NOT NULL,
	"montant" integer NOT NULL,
	"journal_manuel_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "immobilisation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "immobilisation" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "immobilisation" AS PERMISSIVE FOR ALL TO public USING ("immobilisation"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("immobilisation"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "immobilisation_entreprise_idx" ON "immobilisation" USING btree ("entreprise_id");--> statement-breakpoint
ALTER TABLE "dotation_amortissement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dotation_amortissement" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "dotation_amortissement" AS PERMISSIVE FOR ALL TO public USING ("dotation_amortissement"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("dotation_amortissement"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dotation_amortissement_entreprise_idx" ON "dotation_amortissement" USING btree ("entreprise_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "immobilisation" ADD CONSTRAINT "immobilisation_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "immobilisation" ADD CONSTRAINT "immobilisation_cree_par_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dotation_amortissement" ADD CONSTRAINT "dotation_amortissement_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dotation_amortissement" ADD CONSTRAINT "dotation_amortissement_immobilisation_id_fk" FOREIGN KEY ("immobilisation_id") REFERENCES "public"."immobilisation"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dotation_amortissement" ADD CONSTRAINT "dotation_amortissement_journal_manuel_id_fk" FOREIGN KEY ("journal_manuel_id") REFERENCES "public"."journal_manuel"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dotation_amortissement_bien_annee_unique" ON "dotation_amortissement" USING btree ("immobilisation_id","annee");

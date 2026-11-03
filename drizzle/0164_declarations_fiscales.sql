CREATE TABLE IF NOT EXISTS "declaration_fiscale" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"type" text NOT NULL,
	"periode" text NOT NULL,
	"echeance" text NOT NULL,
	"statut" text DEFAULT 'A_FAIRE' NOT NULL,
	"montant" integer,
	"reference" text,
	"declaree_le" timestamp,
	"modifie_par_id" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "declaration_fiscale" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "declaration_fiscale" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "declaration_fiscale" AS PERMISSIVE FOR ALL TO public USING ("declaration_fiscale"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("declaration_fiscale"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "declaration_fiscale" ADD CONSTRAINT "declaration_fiscale_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "declaration_fiscale" ADD CONSTRAINT "declaration_fiscale_modifie_par_id_fk" FOREIGN KEY ("modifie_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "declaration_fiscale_periode_unique" ON "declaration_fiscale" USING btree ("entreprise_id","type","periode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "declaration_fiscale_entreprise_idx" ON "declaration_fiscale" USING btree ("entreprise_id");

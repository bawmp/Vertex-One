CREATE TABLE IF NOT EXISTS "taux_change" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"devise" text NOT NULL,
	"taux_milliemes" integer NOT NULL,
	"date_effet" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "taux_change" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "taux_change" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "taux_change" AS PERMISSIVE FOR ALL TO public USING ("taux_change"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("taux_change"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "taux_change" ADD CONSTRAINT "taux_change_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "taux_change_devise_date_unique" ON "taux_change" USING btree ("entreprise_id","devise","date_effet");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "taux_change_entreprise_idx" ON "taux_change" USING btree ("entreprise_id");

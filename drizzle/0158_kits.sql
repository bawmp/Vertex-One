ALTER TABLE "produit" ADD COLUMN IF NOT EXISTS "est_kit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "composant_kit" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"kit_id" text NOT NULL,
	"composant_id" text NOT NULL,
	"quantite" integer NOT NULL
);--> statement-breakpoint
ALTER TABLE "composant_kit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "composant_kit" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "composant_kit" AS PERMISSIVE FOR ALL TO public USING ("composant_kit"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("composant_kit"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "composant_kit" ADD CONSTRAINT "composant_kit_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "composant_kit" ADD CONSTRAINT "composant_kit_kit_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."produit"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "composant_kit" ADD CONSTRAINT "composant_kit_composant_id_fk" FOREIGN KEY ("composant_id") REFERENCES "public"."produit"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "composant_kit_entreprise_idx" ON "composant_kit" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "composant_kit_composant_idx" ON "composant_kit" USING btree ("composant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "composant_kit_unique" ON "composant_kit" USING btree ("kit_id","composant_id");

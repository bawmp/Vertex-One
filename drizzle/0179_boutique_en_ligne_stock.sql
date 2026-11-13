-- Boutique en ligne connectée : le site lit le stock de Vertex One et lui déclare ses commandes (2026-11-12).
ALTER TABLE "cle_api_entreprise" ADD COLUMN IF NOT EXISTS "autorise_stock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cle_api_entreprise" ADD COLUMN IF NOT EXISTS "depot_stock_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cle_api_entreprise" ADD CONSTRAINT "cle_api_entreprise_depot_stock_id_fk" FOREIGN KEY ("depot_stock_id") REFERENCES "public"."depot"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commande_site" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"cle_id" text,
	"source" text NOT NULL,
	"reference" text NOT NULL,
	"statut" text DEFAULT 'ENREGISTREE' NOT NULL,
	"lignes" json NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"annulee_le" timestamp
);--> statement-breakpoint
ALTER TABLE "commande_site" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "commande_site" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "commande_site" AS PERMISSIVE FOR ALL TO public USING ("commande_site"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("commande_site"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commande_site" ADD CONSTRAINT "commande_site_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commande_site" ADD CONSTRAINT "commande_site_cle_id_fk" FOREIGN KEY ("cle_id") REFERENCES "public"."cle_api_entreprise"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commande_site_entreprise_idx" ON "commande_site" USING btree ("entreprise_id","cree_le");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "commande_site_cle_reference_unique" ON "commande_site" USING btree ("cle_id","reference");

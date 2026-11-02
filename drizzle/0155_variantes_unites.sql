CREATE TABLE IF NOT EXISTS "famille_produit" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "famille_produit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "famille_produit" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "famille_produit" AS PERMISSIVE FOR ALL TO public USING ("famille_produit"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("famille_produit"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "famille_produit" ADD CONSTRAINT "famille_produit_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "famille_produit_entreprise_idx" ON "famille_produit" USING btree ("entreprise_id");--> statement-breakpoint
ALTER TABLE "produit" ADD COLUMN IF NOT EXISTS "famille_id" text;--> statement-breakpoint
ALTER TABLE "produit" ADD COLUMN IF NOT EXISTS "variante" text;--> statement-breakpoint
ALTER TABLE "produit" ADD COLUMN IF NOT EXISTS "unite" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "produit" ADD CONSTRAINT "produit_famille_id_fk" FOREIGN KEY ("famille_id") REFERENCES "public"."famille_produit"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "produit_famille_idx" ON "produit" USING btree ("famille_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conditionnement_produit" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"produit_id" text NOT NULL,
	"nom" text NOT NULL,
	"quantite_base" integer NOT NULL
);--> statement-breakpoint
ALTER TABLE "conditionnement_produit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conditionnement_produit" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "conditionnement_produit" AS PERMISSIVE FOR ALL TO public USING ("conditionnement_produit"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("conditionnement_produit"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conditionnement_produit" ADD CONSTRAINT "conditionnement_produit_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conditionnement_produit" ADD CONSTRAINT "conditionnement_produit_produit_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produit"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conditionnement_produit_entreprise_idx" ON "conditionnement_produit" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conditionnement_produit_nom_unique" ON "conditionnement_produit" USING btree ("produit_id","nom");

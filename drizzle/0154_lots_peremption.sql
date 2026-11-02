ALTER TABLE "produit" ADD COLUMN IF NOT EXISTS "suivi_lots" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lot_stock" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"produit_id" text NOT NULL,
	"numero_lot" text NOT NULL,
	"date_peremption" date,
	"quantite" integer DEFAULT 0 NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "lot_stock" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lot_stock" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "lot_stock" AS PERMISSIVE FOR ALL TO public USING ("lot_stock"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("lot_stock"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lot_stock" ADD CONSTRAINT "lot_stock_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lot_stock" ADD CONSTRAINT "lot_stock_produit_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produit"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lot_stock_entreprise_idx" ON "lot_stock" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lot_stock_produit_numero_unique" ON "lot_stock" USING btree ("produit_id","numero_lot");

ALTER TABLE "produit" ADD COLUMN IF NOT EXISTS "suivi_serie" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "numero_serie" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"produit_id" text NOT NULL,
	"numero" text NOT NULL,
	"statut" text DEFAULT 'EN_STOCK' NOT NULL,
	"entre_le" timestamp DEFAULT now() NOT NULL,
	"vendu_le" timestamp,
	"document_type" text,
	"document_id" text
);--> statement-breakpoint
ALTER TABLE "numero_serie" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "numero_serie" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "numero_serie" AS PERMISSIVE FOR ALL TO public USING ("numero_serie"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("numero_serie"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "numero_serie" ADD CONSTRAINT "numero_serie_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "numero_serie" ADD CONSTRAINT "numero_serie_produit_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produit"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "numero_serie_produit_numero_unique" ON "numero_serie" USING btree ("produit_id","numero");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "numero_serie_entreprise_idx" ON "numero_serie" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "numero_serie_produit_statut_idx" ON "numero_serie" USING btree ("produit_id","statut");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "numero_serie_document_idx" ON "numero_serie" USING btree ("document_id");

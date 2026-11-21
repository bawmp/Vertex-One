-- Demande de révision d'un devis par le client depuis son lien public (2026-11-21). Rejouable.
CREATE TABLE IF NOT EXISTS "demande_revision_devis" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"devis_id" text NOT NULL,
	"message" text NOT NULL,
	"client_ip" text,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"traite_le" timestamp
);--> statement-breakpoint
ALTER TABLE "demande_revision_devis" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "demande_revision_devis" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "demande_revision_devis" AS PERMISSIVE FOR ALL TO public USING ("demande_revision_devis"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("demande_revision_devis"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demande_revision_devis" ADD CONSTRAINT "demande_revision_devis_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demande_revision_devis" ADD CONSTRAINT "demande_revision_devis_devis_id_fk" FOREIGN KEY ("devis_id") REFERENCES "public"."devis"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "demande_revision_devis_devis_idx" ON "demande_revision_devis" USING btree ("devis_id");

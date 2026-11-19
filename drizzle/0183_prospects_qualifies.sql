-- Prospects qualifiés (2026-11-19) : un lead qualifié reste dans un espace dédié, relançable par e-mail ou WhatsApp, et ne devient Contact qu'une fois client.
-- `qualifie_le` : le jour où le lead est devenu QUALIFIE (les leads déjà qualifiés reprennent leur date de création).
-- `rappel_le` : le jour où l'équipe veut relancer ce prospect.
ALTER TABLE "lead" ADD COLUMN IF NOT EXISTS "qualifie_le" timestamp;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN IF NOT EXISTS "rappel_le" date;--> statement-breakpoint
UPDATE "lead" SET "qualifie_le" = "cree_le" WHERE "statut" = 'QUALIFIE' AND "qualifie_le" IS NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relance_prospect" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"canal" text NOT NULL,
	"contenu" text NOT NULL,
	"auteur_id" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "relance_prospect" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "relance_prospect" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "relance_prospect" AS PERMISSIVE FOR ALL TO public USING ("relance_prospect"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("relance_prospect"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "relance_prospect" ADD CONSTRAINT "relance_prospect_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "relance_prospect" ADD CONSTRAINT "relance_prospect_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "relance_prospect" ADD CONSTRAINT "relance_prospect_auteur_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relance_prospect_entreprise_idx" ON "relance_prospect" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relance_prospect_lead_idx" ON "relance_prospect" USING btree ("lead_id","cree_le");

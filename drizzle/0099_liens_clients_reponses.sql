-- Devis/factures consultables, acceptables et payables par le client depuis un
-- lien public (2026-09-20), et refus explicite d'une signature.
-- Une nouvelle table (RLS + FORCE) et des colonnes nullables. Rejouable sans erreur.
ALTER TABLE "devis" ADD COLUMN IF NOT EXISTS "reponse_le" timestamp;--> statement-breakpoint
ALTER TABLE "devis" ADD COLUMN IF NOT EXISTS "motif_refus" text;--> statement-breakpoint
ALTER TABLE "devis" ADD COLUMN IF NOT EXISTS "reponse_ip" text;--> statement-breakpoint
ALTER TABLE "facture" ADD COLUMN IF NOT EXISTS "reponse_client" text;--> statement-breakpoint
ALTER TABLE "facture" ADD COLUMN IF NOT EXISTS "reponse_client_le" timestamp;--> statement-breakpoint
ALTER TABLE "facture" ADD COLUMN IF NOT EXISTS "motif_contestation" text;--> statement-breakpoint
ALTER TABLE "signataire" ADD COLUMN IF NOT EXISTS "refuse_le" timestamp;--> statement-breakpoint
ALTER TABLE "signataire" ADD COLUMN IF NOT EXISTS "motif_refus" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lien_client_document" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"devis_id" text,
	"facture_id" text,
	"jeton" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lien_client_document_jeton_unique" UNIQUE("jeton")
);--> statement-breakpoint
ALTER TABLE "lien_client_document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lien_client_document" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lien_client_document" ADD CONSTRAINT "lien_client_document_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_client_document" ADD CONSTRAINT "lien_client_document_devis_id_devis_id_fk" FOREIGN KEY ("devis_id") REFERENCES "public"."devis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_client_document" ADD CONSTRAINT "lien_client_document_facture_id_facture_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."facture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lien_client_document_entreprise_idx" ON "lien_client_document" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lien_client_document_devis_unique" ON "lien_client_document" USING btree ("devis_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lien_client_document_facture_unique" ON "lien_client_document" USING btree ("facture_id");--> statement-breakpoint
CREATE POLICY "lecture_par_jeton_ou_entreprise" ON "lien_client_document" AS PERMISSIVE FOR SELECT TO public USING ("lien_client_document"."entreprise_id" = current_setting('app.entreprise_id', true) OR nullif(current_setting('app.entreprise_id', true), '') IS NULL);--> statement-breakpoint
CREATE POLICY "ecriture_entreprise" ON "lien_client_document" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("lien_client_document"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "modification_entreprise" ON "lien_client_document" AS PERMISSIVE FOR UPDATE TO public USING ("lien_client_document"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("lien_client_document"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "suppression_entreprise" ON "lien_client_document" AS PERMISSIVE FOR DELETE TO public USING ("lien_client_document"."entreprise_id" = current_setting('app.entreprise_id', true));

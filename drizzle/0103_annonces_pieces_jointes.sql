-- Pièces jointes des annonces (2026-09-21) : une nouvelle table (RLS + FORCE), aucune colonne modifiée.
-- Rejouable sans erreur.
CREATE TABLE IF NOT EXISTS "piece_jointe_annonce" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"annonce_id" text NOT NULL,
	"cle_stockage" text NOT NULL,
	"nom" text NOT NULL,
	"type_mime" text NOT NULL,
	"taille_octets" integer NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "piece_jointe_annonce" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "piece_jointe_annonce" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "piece_jointe_annonce" ADD CONSTRAINT "piece_jointe_annonce_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_jointe_annonce" ADD CONSTRAINT "piece_jointe_annonce_annonce_id_annonce_id_fk" FOREIGN KEY ("annonce_id") REFERENCES "public"."annonce"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "piece_jointe_annonce_entreprise_idx" ON "piece_jointe_annonce" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "piece_jointe_annonce_annonce_idx" ON "piece_jointe_annonce" USING btree ("annonce_id");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "piece_jointe_annonce" AS PERMISSIVE FOR ALL TO public USING ("piece_jointe_annonce"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("piece_jointe_annonce"."entreprise_id" = current_setting('app.entreprise_id', true));

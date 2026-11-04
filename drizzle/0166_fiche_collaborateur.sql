ALTER TABLE "invitation" ADD COLUMN IF NOT EXISTS "date_naissance_propose" text;--> statement-breakpoint
ALTER TABLE "utilisateur" ADD COLUMN IF NOT EXISTS "photo_cle_stockage" text;--> statement-breakpoint
ALTER TABLE "utilisateur" ADD COLUMN IF NOT EXISTS "photo_type_mime" text;--> statement-breakpoint
ALTER TABLE "dossier_rh" ADD COLUMN IF NOT EXISTS "date_naissance" text;--> statement-breakpoint
ALTER TABLE "dossier_rh" ADD COLUMN IF NOT EXISTS "telephone" text;--> statement-breakpoint
ALTER TABLE "dossier_rh" ADD COLUMN IF NOT EXISTS "adresse" text;--> statement-breakpoint
ALTER TABLE "dossier_rh" ADD COLUMN IF NOT EXISTS "urgence_nom" text;--> statement-breakpoint
ALTER TABLE "dossier_rh" ADD COLUMN IF NOT EXISTS "urgence_telephone" text;--> statement-breakpoint
ALTER TABLE "stagiaire_academique" ADD COLUMN IF NOT EXISTS "date_naissance" text;--> statement-breakpoint
ALTER TABLE "stagiaire_academique" ADD COLUMN IF NOT EXISTS "photo_cle_stockage" text;--> statement-breakpoint
ALTER TABLE "stagiaire_academique" ADD COLUMN IF NOT EXISTS "photo_type_mime" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rappel_anniversaire" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"cible_type" text NOT NULL,
	"cible_id" text NOT NULL,
	"annee" integer NOT NULL,
	"envoye_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "rappel_anniversaire" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rappel_anniversaire" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "rappel_anniversaire" AS PERMISSIVE FOR ALL TO public USING ("rappel_anniversaire"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("rappel_anniversaire"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rappel_anniversaire" ADD CONSTRAINT "rappel_anniversaire_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rappel_anniversaire_unique" ON "rappel_anniversaire" USING btree ("entreprise_id","cible_type","cible_id","annee");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rappel_anniversaire_entreprise_idx" ON "rappel_anniversaire" USING btree ("entreprise_id");

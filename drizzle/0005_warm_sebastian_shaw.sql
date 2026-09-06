CREATE TYPE "public"."type_modele_email" AS ENUM('ENVOI_DEVIS', 'ENVOI_FACTURE');--> statement-breakpoint
CREATE TABLE "modele_email" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"type" "type_modele_email" NOT NULL,
	"objet" text NOT NULL,
	"corps" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "modele_email" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "modele_email" ADD CONSTRAINT "modele_email_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "modele_email_entreprise_type_unique" ON "modele_email" USING btree ("entreprise_id","type");--> statement-breakpoint
CREATE INDEX "modele_email_entreprise_idx" ON "modele_email" USING btree ("entreprise_id");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "modele_email" AS PERMISSIVE FOR ALL TO public USING ("modele_email"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("modele_email"."entreprise_id" = current_setting('app.entreprise_id', true));
CREATE TABLE "document_rh" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"dossier_rh_id" text NOT NULL,
	"nom" text NOT NULL,
	"cle_stockage" text NOT NULL,
	"type_mime" text NOT NULL,
	"taille_octets" integer NOT NULL,
	"televerse_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_rh" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "document_rh" ADD CONSTRAINT "document_rh_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_rh" ADD CONSTRAINT "document_rh_dossier_rh_id_dossier_rh_id_fk" FOREIGN KEY ("dossier_rh_id") REFERENCES "public"."dossier_rh"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_rh" ADD CONSTRAINT "document_rh_televerse_par_id_utilisateur_id_fk" FOREIGN KEY ("televerse_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "document_rh_entreprise_idx" ON "document_rh" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "document_rh_dossier_rh_idx" ON "document_rh" USING btree ("dossier_rh_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "document_rh" AS PERMISSIVE FOR ALL TO public USING ("document_rh"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("document_rh"."entreprise_id" = current_setting('app.entreprise_id', true));

CREATE TYPE "public"."statut_regularisation" AS ENUM('EN_ATTENTE', 'APPROUVEE', 'REFUSEE');--> statement-breakpoint

CREATE TABLE "regularisation_pointage" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"dossier_rh_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"heure_arrivee_proposee" timestamp,
	"heure_depart_proposee" timestamp,
	"motif" text NOT NULL,
	"statut" "statut_regularisation" DEFAULT 'EN_ATTENTE' NOT NULL,
	"approuve_par_id" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regularisation_pointage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "regularisation_pointage" ADD CONSTRAINT "regularisation_pointage_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regularisation_pointage" ADD CONSTRAINT "regularisation_pointage_dossier_rh_id_dossier_rh_id_fk" FOREIGN KEY ("dossier_rh_id") REFERENCES "public"."dossier_rh"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regularisation_pointage" ADD CONSTRAINT "regularisation_pointage_approuve_par_id_utilisateur_id_fk" FOREIGN KEY ("approuve_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "regularisation_pointage_entreprise_idx" ON "regularisation_pointage" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "regularisation_pointage_dossier_rh_idx" ON "regularisation_pointage" USING btree ("dossier_rh_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "regularisation_pointage" AS PERMISSIVE FOR ALL TO public USING ("regularisation_pointage"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("regularisation_pointage"."entreprise_id" = current_setting('app.entreprise_id', true));

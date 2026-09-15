-- Custom SQL migration file, put your code below! --
CREATE TABLE "autorisation_departement_rh" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"utilisateur_id" text NOT NULL,
	"service_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "autorisation_departement_rh" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "autorisation_departement_rh" ADD CONSTRAINT "autorisation_departement_rh_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autorisation_departement_rh" ADD CONSTRAINT "autorisation_departement_rh_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autorisation_departement_rh" ADD CONSTRAINT "autorisation_departement_rh_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "autorisation_departement_rh_entreprise_idx" ON "autorisation_departement_rh" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "autorisation_departement_rh_unique" ON "autorisation_departement_rh" USING btree ("utilisateur_id","service_id");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "autorisation_departement_rh" AS PERMISSIVE FOR ALL TO public USING ("autorisation_departement_rh"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("autorisation_departement_rh"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
ALTER TABLE "autorisation_departement_rh" FORCE ROW LEVEL SECURITY;

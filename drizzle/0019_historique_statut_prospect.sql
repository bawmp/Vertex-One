CREATE TABLE "historique_statut_prospect" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"prospect_id" text NOT NULL,
	"ancien_statut" "statut_prospect",
	"nouveau_statut" "statut_prospect" NOT NULL,
	"modifie_par_id" text NOT NULL,
	"modifie_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "historique_statut_prospect" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "historique_statut_prospect" ADD CONSTRAINT "historique_statut_prospect_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_statut_prospect" ADD CONSTRAINT "historique_statut_prospect_prospect_id_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospect"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_statut_prospect" ADD CONSTRAINT "historique_statut_prospect_modifie_par_id_utilisateur_id_fk" FOREIGN KEY ("modifie_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "historique_statut_prospect_entreprise_idx" ON "historique_statut_prospect" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "historique_statut_prospect_prospect_idx" ON "historique_statut_prospect" USING btree ("prospect_id");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "historique_statut_prospect" AS PERMISSIVE FOR ALL TO public USING ("historique_statut_prospect"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("historique_statut_prospect"."entreprise_id" = current_setting('app.entreprise_id', true));
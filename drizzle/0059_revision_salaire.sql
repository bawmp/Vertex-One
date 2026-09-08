CREATE TABLE "revision_salaire" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"dossier_rh_id" text NOT NULL,
	"ancien_salaire" integer,
	"nouveau_salaire" integer NOT NULL,
	"motif" text,
	"effectue_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "revision_salaire" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "revision_salaire" ADD CONSTRAINT "revision_salaire_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_salaire" ADD CONSTRAINT "revision_salaire_dossier_rh_id_dossier_rh_id_fk" FOREIGN KEY ("dossier_rh_id") REFERENCES "public"."dossier_rh"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_salaire" ADD CONSTRAINT "revision_salaire_effectue_par_id_utilisateur_id_fk" FOREIGN KEY ("effectue_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "revision_salaire_entreprise_idx" ON "revision_salaire" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "revision_salaire_dossier_rh_idx" ON "revision_salaire" USING btree ("dossier_rh_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "revision_salaire" AS PERMISSIVE FOR ALL TO public USING ("revision_salaire"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("revision_salaire"."entreprise_id" = current_setting('app.entreprise_id', true));

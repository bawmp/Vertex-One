ALTER TABLE "projet" ADD COLUMN "taux_horaire_par_defaut" integer;--> statement-breakpoint

CREATE TABLE "entree_temps" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"projet_id" text NOT NULL,
	"tache_id" text,
	"utilisateur_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"duree_heures" numeric(5, 2) NOT NULL,
	"facturable" boolean DEFAULT true NOT NULL,
	"taux_horaire" integer DEFAULT 0 NOT NULL,
	"note" text,
	"facture_id" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entree_temps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "entree_temps" ADD CONSTRAINT "entree_temps_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entree_temps" ADD CONSTRAINT "entree_temps_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entree_temps" ADD CONSTRAINT "entree_temps_tache_id_tache_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."tache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entree_temps" ADD CONSTRAINT "entree_temps_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entree_temps" ADD CONSTRAINT "entree_temps_facture_id_facture_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."facture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "entree_temps_entreprise_idx" ON "entree_temps" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "entree_temps_projet_idx" ON "entree_temps" USING btree ("projet_id");--> statement-breakpoint
CREATE INDEX "entree_temps_utilisateur_idx" ON "entree_temps" USING btree ("utilisateur_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "entree_temps" AS PERMISSIVE FOR ALL TO public USING ("entree_temps"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("entree_temps"."entreprise_id" = current_setting('app.entreprise_id', true));

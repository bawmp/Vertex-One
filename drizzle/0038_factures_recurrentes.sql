CREATE TYPE "public"."frequence_facture_recurrente" AS ENUM('MENSUEL', 'TRIMESTRIEL', 'ANNUEL');--> statement-breakpoint
CREATE TYPE "public"."statut_facture_recurrente" AS ENUM('ACTIF', 'EN_PAUSE', 'TERMINE');--> statement-breakpoint

CREATE TABLE "facture_recurrente" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"deal_id" text NOT NULL,
	"libelle" text NOT NULL,
	"frequence" "frequence_facture_recurrente" NOT NULL,
	"statut" "statut_facture_recurrente" DEFAULT 'ACTIF' NOT NULL,
	"date_debut" timestamp NOT NULL,
	"date_fin" timestamp,
	"prochaine_date_generation" timestamp NOT NULL,
	"montant_ht" integer NOT NULL,
	"montant_tva" integer DEFAULT 0 NOT NULL,
	"montant_ttc" integer NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facture_recurrente" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "ligne_facture_recurrente" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"facture_recurrente_id" text NOT NULL,
	"produit_id" text,
	"designation" text NOT NULL,
	"quantite" numeric(10, 2) NOT NULL,
	"prix_unitaire" integer NOT NULL,
	"taux_tva" numeric(5, 2) DEFAULT 19.25 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ligne_facture_recurrente" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "facture" ADD COLUMN "facture_recurrente_id" text;--> statement-breakpoint

ALTER TABLE "facture_recurrente" ADD CONSTRAINT "facture_recurrente_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture_recurrente" ADD CONSTRAINT "facture_recurrente_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture_recurrente" ADD CONSTRAINT "facture_recurrente_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "ligne_facture_recurrente" ADD CONSTRAINT "ligne_facture_recurrente_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligne_facture_recurrente" ADD CONSTRAINT "ligne_facture_recurrente_facture_recurrente_id_facture_recurrente_id_fk" FOREIGN KEY ("facture_recurrente_id") REFERENCES "public"."facture_recurrente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligne_facture_recurrente" ADD CONSTRAINT "ligne_facture_recurrente_produit_id_produit_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "facture" ADD CONSTRAINT "facture_facture_recurrente_id_facture_recurrente_id_fk" FOREIGN KEY ("facture_recurrente_id") REFERENCES "public"."facture_recurrente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "facture_recurrente_entreprise_idx" ON "facture_recurrente" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "facture_recurrente_deal_idx" ON "facture_recurrente" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "facture_recurrente_prochaine_generation_idx" ON "facture_recurrente" USING btree ("prochaine_date_generation");--> statement-breakpoint
CREATE INDEX "ligne_facture_recurrente_entreprise_idx" ON "ligne_facture_recurrente" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "ligne_facture_recurrente_fr_idx" ON "ligne_facture_recurrente" USING btree ("facture_recurrente_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "facture_recurrente" AS PERMISSIVE FOR ALL TO public USING ("facture_recurrente"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("facture_recurrente"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "ligne_facture_recurrente" AS PERMISSIVE FOR ALL TO public USING ("ligne_facture_recurrente"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("ligne_facture_recurrente"."entreprise_id" = current_setting('app.entreprise_id', true));

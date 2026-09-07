ALTER TABLE "entreprise" ADD COLUMN "compteur_bons_commande_vente" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

CREATE TYPE "public"."statut_bon_commande_vente" AS ENUM('BROUILLON', 'FACTURE', 'ANNULE');--> statement-breakpoint

CREATE TABLE "bon_commande_vente" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"numero" text NOT NULL,
	"deal_id" text NOT NULL,
	"statut" "statut_bon_commande_vente" DEFAULT 'BROUILLON' NOT NULL,
	"date_commande" timestamp DEFAULT now() NOT NULL,
	"montant_ht" integer NOT NULL,
	"montant_tva" integer DEFAULT 0 NOT NULL,
	"montant_ttc" integer NOT NULL,
	"facture_id" text,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bon_commande_vente" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "ligne_bon_commande_vente" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"bon_commande_vente_id" text NOT NULL,
	"produit_id" text,
	"designation" text NOT NULL,
	"quantite" numeric(10, 2) NOT NULL,
	"prix_unitaire" integer NOT NULL,
	"taux_tva" numeric(5, 2) DEFAULT 19.25 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ligne_bon_commande_vente" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "bon_commande_vente" ADD CONSTRAINT "bon_commande_vente_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bon_commande_vente" ADD CONSTRAINT "bon_commande_vente_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bon_commande_vente" ADD CONSTRAINT "bon_commande_vente_facture_id_facture_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."facture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bon_commande_vente" ADD CONSTRAINT "bon_commande_vente_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "ligne_bon_commande_vente" ADD CONSTRAINT "ligne_bon_commande_vente_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligne_bon_commande_vente" ADD CONSTRAINT "ligne_bon_commande_vente_bon_commande_vente_id_bon_commande_vente_id_fk" FOREIGN KEY ("bon_commande_vente_id") REFERENCES "public"."bon_commande_vente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligne_bon_commande_vente" ADD CONSTRAINT "ligne_bon_commande_vente_produit_id_produit_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "bon_commande_vente_entreprise_idx" ON "bon_commande_vente" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "bon_commande_vente_deal_idx" ON "bon_commande_vente" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "ligne_bon_commande_vente_entreprise_idx" ON "ligne_bon_commande_vente" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "ligne_bon_commande_vente_bcv_idx" ON "ligne_bon_commande_vente" USING btree ("bon_commande_vente_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "bon_commande_vente" AS PERMISSIVE FOR ALL TO public USING ("bon_commande_vente"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("bon_commande_vente"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "ligne_bon_commande_vente" AS PERMISSIVE FOR ALL TO public USING ("ligne_bon_commande_vente"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("ligne_bon_commande_vente"."entreprise_id" = current_setting('app.entreprise_id', true));

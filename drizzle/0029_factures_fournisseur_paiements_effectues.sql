CREATE TYPE "public"."statut_facture_fournisseur" AS ENUM('EN_ATTENTE', 'PARTIELLEMENT_PAYEE', 'PAYEE', 'ANNULEE');--> statement-breakpoint

CREATE TABLE "facture_fournisseur" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"numero" text NOT NULL,
	"fournisseur_id" text NOT NULL,
	"compte_comptable_id" text NOT NULL,
	"statut" "statut_facture_fournisseur" DEFAULT 'EN_ATTENTE' NOT NULL,
	"date_facture" timestamp NOT NULL,
	"date_echeance" timestamp NOT NULL,
	"montant_ht" integer NOT NULL,
	"montant_tva" integer DEFAULT 0 NOT NULL,
	"montant_ttc" integer NOT NULL,
	"assigne_a_id" text NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facture_fournisseur" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "ligne_facture_fournisseur" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"facture_fournisseur_id" text NOT NULL,
	"designation" text NOT NULL,
	"quantite" numeric(10, 2) NOT NULL,
	"prix_unitaire" integer NOT NULL,
	"taux_tva" numeric(5, 2) DEFAULT 19.25 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ligne_facture_fournisseur" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "paiement_effectue" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"facture_fournisseur_id" text NOT NULL,
	"montant" integer NOT NULL,
	"moyen_paiement" "moyen_paiement" NOT NULL,
	"reference_transaction" text,
	"date_paiement" timestamp DEFAULT now() NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paiement_effectue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "ecriture_comptable" ADD COLUMN "facture_fournisseur_id" text;--> statement-breakpoint
ALTER TABLE "ecriture_comptable" ADD COLUMN "paiement_effectue_id" text;--> statement-breakpoint

ALTER TABLE "facture_fournisseur" ADD CONSTRAINT "facture_fournisseur_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture_fournisseur" ADD CONSTRAINT "facture_fournisseur_fournisseur_id_fournisseur_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."fournisseur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture_fournisseur" ADD CONSTRAINT "facture_fournisseur_compte_comptable_id_compte_comptable_id_fk" FOREIGN KEY ("compte_comptable_id") REFERENCES "public"."compte_comptable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture_fournisseur" ADD CONSTRAINT "facture_fournisseur_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture_fournisseur" ADD CONSTRAINT "facture_fournisseur_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "ligne_facture_fournisseur" ADD CONSTRAINT "ligne_facture_fournisseur_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligne_facture_fournisseur" ADD CONSTRAINT "ligne_facture_fournisseur_facture_fournisseur_id_facture_fournisseur_id_fk" FOREIGN KEY ("facture_fournisseur_id") REFERENCES "public"."facture_fournisseur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "paiement_effectue" ADD CONSTRAINT "paiement_effectue_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiement_effectue" ADD CONSTRAINT "paiement_effectue_facture_fournisseur_id_facture_fournisseur_id_fk" FOREIGN KEY ("facture_fournisseur_id") REFERENCES "public"."facture_fournisseur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiement_effectue" ADD CONSTRAINT "paiement_effectue_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "facture_fournisseur_entreprise_idx" ON "facture_fournisseur" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "facture_fournisseur_fournisseur_idx" ON "facture_fournisseur" USING btree ("fournisseur_id");--> statement-breakpoint
CREATE INDEX "facture_fournisseur_assigne_idx" ON "facture_fournisseur" USING btree ("assigne_a_id");--> statement-breakpoint
CREATE INDEX "ligne_facture_fournisseur_entreprise_idx" ON "ligne_facture_fournisseur" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "ligne_facture_fournisseur_facture_idx" ON "ligne_facture_fournisseur" USING btree ("facture_fournisseur_id");--> statement-breakpoint
CREATE INDEX "paiement_effectue_entreprise_idx" ON "paiement_effectue" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "paiement_effectue_facture_idx" ON "paiement_effectue" USING btree ("facture_fournisseur_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "facture_fournisseur" AS PERMISSIVE FOR ALL TO public USING ("facture_fournisseur"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("facture_fournisseur"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "ligne_facture_fournisseur" AS PERMISSIVE FOR ALL TO public USING ("ligne_facture_fournisseur"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("ligne_facture_fournisseur"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "paiement_effectue" AS PERMISSIVE FOR ALL TO public USING ("paiement_effectue"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("paiement_effectue"."entreprise_id" = current_setting('app.entreprise_id', true));

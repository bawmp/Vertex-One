ALTER TABLE "entreprise" ADD COLUMN "compteur_bons_commande_achat" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

CREATE TYPE "public"."statut_bon_commande_achat" AS ENUM('BROUILLON', 'FACTURE', 'ANNULE');--> statement-breakpoint

CREATE TABLE "bon_commande_achat" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"numero" text NOT NULL,
	"fournisseur_id" text NOT NULL,
	"compte_comptable_id" text NOT NULL,
	"statut" "statut_bon_commande_achat" DEFAULT 'BROUILLON' NOT NULL,
	"date_commande" timestamp DEFAULT now() NOT NULL,
	"montant_ht" integer NOT NULL,
	"montant_tva" integer DEFAULT 0 NOT NULL,
	"montant_ttc" integer NOT NULL,
	"facture_fournisseur_id" text,
	"assigne_a_id" text NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bon_commande_achat" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "ligne_bon_commande_achat" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"bon_commande_achat_id" text NOT NULL,
	"designation" text NOT NULL,
	"quantite" numeric(10, 2) NOT NULL,
	"prix_unitaire" integer NOT NULL,
	"taux_tva" numeric(5, 2) DEFAULT 19.25 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ligne_bon_commande_achat" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "avoir_fournisseur" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"facture_fournisseur_id" text NOT NULL,
	"motif" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "avoir_fournisseur_facture_fournisseur_id_unique" UNIQUE("facture_fournisseur_id")
);
--> statement-breakpoint
ALTER TABLE "avoir_fournisseur" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "bon_commande_achat" ADD CONSTRAINT "bon_commande_achat_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bon_commande_achat" ADD CONSTRAINT "bon_commande_achat_fournisseur_id_fournisseur_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."fournisseur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bon_commande_achat" ADD CONSTRAINT "bon_commande_achat_compte_comptable_id_compte_comptable_id_fk" FOREIGN KEY ("compte_comptable_id") REFERENCES "public"."compte_comptable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bon_commande_achat" ADD CONSTRAINT "bon_commande_achat_facture_fournisseur_id_facture_fournisseur_id_fk" FOREIGN KEY ("facture_fournisseur_id") REFERENCES "public"."facture_fournisseur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bon_commande_achat" ADD CONSTRAINT "bon_commande_achat_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bon_commande_achat" ADD CONSTRAINT "bon_commande_achat_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "ligne_bon_commande_achat" ADD CONSTRAINT "ligne_bon_commande_achat_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligne_bon_commande_achat" ADD CONSTRAINT "ligne_bon_commande_achat_bon_commande_achat_id_bon_commande_achat_id_fk" FOREIGN KEY ("bon_commande_achat_id") REFERENCES "public"."bon_commande_achat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "avoir_fournisseur" ADD CONSTRAINT "avoir_fournisseur_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avoir_fournisseur" ADD CONSTRAINT "avoir_fournisseur_facture_fournisseur_id_facture_fournisseur_id_fk" FOREIGN KEY ("facture_fournisseur_id") REFERENCES "public"."facture_fournisseur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "bon_commande_achat_entreprise_idx" ON "bon_commande_achat" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "bon_commande_achat_fournisseur_idx" ON "bon_commande_achat" USING btree ("fournisseur_id");--> statement-breakpoint
CREATE INDEX "bon_commande_achat_assigne_idx" ON "bon_commande_achat" USING btree ("assigne_a_id");--> statement-breakpoint
CREATE INDEX "ligne_bon_commande_achat_entreprise_idx" ON "ligne_bon_commande_achat" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "ligne_bon_commande_achat_bc_idx" ON "ligne_bon_commande_achat" USING btree ("bon_commande_achat_id");--> statement-breakpoint
CREATE INDEX "avoir_fournisseur_entreprise_idx" ON "avoir_fournisseur" USING btree ("entreprise_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "bon_commande_achat" AS PERMISSIVE FOR ALL TO public USING ("bon_commande_achat"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("bon_commande_achat"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "ligne_bon_commande_achat" AS PERMISSIVE FOR ALL TO public USING ("ligne_bon_commande_achat"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("ligne_bon_commande_achat"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "avoir_fournisseur" AS PERMISSIVE FOR ALL TO public USING ("avoir_fournisseur"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("avoir_fournisseur"."entreprise_id" = current_setting('app.entreprise_id', true));

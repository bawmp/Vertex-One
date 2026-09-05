CREATE TYPE "public"."moyen_paiement" AS ENUM('orange_money', 'mtn_momo', 'especes', 'virement', 'manuel');--> statement-breakpoint
CREATE TYPE "public"."statut_devis" AS ENUM('BROUILLON', 'ENVOYE', 'ACCEPTE', 'REFUSE', 'EXPIRE');--> statement-breakpoint
CREATE TYPE "public"."statut_facture" AS ENUM('EMISE', 'PARTIELLEMENT_PAYEE', 'PAYEE', 'EN_RETARD', 'ANNULEE');--> statement-breakpoint
CREATE TYPE "public"."statut_prospect" AS ENUM('NOUVEAU', 'QUALIFIE', 'PROPOSITION', 'GAGNE', 'PERDU');--> statement-breakpoint
CREATE TABLE "avoir_facture" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"facture_id" text NOT NULL,
	"motif" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "avoir_facture_facture_id_unique" UNIQUE("facture_id")
);
--> statement-breakpoint
ALTER TABLE "avoir_facture" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "devis" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"numero" text NOT NULL,
	"prospect_id" text NOT NULL,
	"statut" "statut_devis" DEFAULT 'BROUILLON' NOT NULL,
	"date_validite" timestamp NOT NULL,
	"montant_ht" integer NOT NULL,
	"montant_tva" integer NOT NULL,
	"montant_ttc" integer NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devis" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "facture" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"numero" text NOT NULL,
	"prospect_id" text NOT NULL,
	"devis_origine_id" text,
	"statut" "statut_facture" DEFAULT 'EMISE' NOT NULL,
	"montant_ht" integer NOT NULL,
	"montant_tva" integer NOT NULL,
	"montant_ttc" integer NOT NULL,
	"date_emission" timestamp DEFAULT now() NOT NULL,
	"date_echeance" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facture" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "interaction" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"prospect_id" text NOT NULL,
	"type" text NOT NULL,
	"contenu" text NOT NULL,
	"auteur_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interaction" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ligne_devis" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"devis_id" text NOT NULL,
	"designation" text NOT NULL,
	"quantite" numeric(10, 2) NOT NULL,
	"prix_unitaire" integer NOT NULL,
	"taux_tva" numeric(5, 2) DEFAULT 19.25 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ligne_devis" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ligne_facture" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"facture_id" text NOT NULL,
	"designation" text NOT NULL,
	"quantite" numeric(10, 2) NOT NULL,
	"prix_unitaire" integer NOT NULL,
	"taux_tva" numeric(5, 2) DEFAULT 19.25 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ligne_facture" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "paiement" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"facture_id" text NOT NULL,
	"montant" integer NOT NULL,
	"moyen_paiement" "moyen_paiement" NOT NULL,
	"reference_transaction" text,
	"saisi_par_id" text,
	"date_paiement" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paiement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prospect" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"societe_cliente" text,
	"niu" text,
	"telephone" text NOT NULL,
	"email" text,
	"statut" "statut_prospect" DEFAULT 'NOUVEAU' NOT NULL,
	"notes" text,
	"assigne_a_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prospect" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entreprise" ADD COLUMN "niu" text;--> statement-breakpoint
ALTER TABLE "entreprise" ADD COLUMN "rccm" text;--> statement-breakpoint
ALTER TABLE "entreprise" ADD COLUMN "adresse" text;--> statement-breakpoint
ALTER TABLE "entreprise" ADD COLUMN "ville" text;--> statement-breakpoint
ALTER TABLE "entreprise" ADD COLUMN "assujetti_tva" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "entreprise" ADD COLUMN "compteur_factures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "entreprise" ADD COLUMN "compteur_devis" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "avoir_facture" ADD CONSTRAINT "avoir_facture_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avoir_facture" ADD CONSTRAINT "avoir_facture_facture_id_facture_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."facture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devis" ADD CONSTRAINT "devis_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devis" ADD CONSTRAINT "devis_prospect_id_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospect"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devis" ADD CONSTRAINT "devis_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture" ADD CONSTRAINT "facture_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture" ADD CONSTRAINT "facture_prospect_id_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospect"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture" ADD CONSTRAINT "facture_devis_origine_id_devis_id_fk" FOREIGN KEY ("devis_origine_id") REFERENCES "public"."devis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_prospect_id_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospect"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_auteur_id_utilisateur_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligne_devis" ADD CONSTRAINT "ligne_devis_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligne_devis" ADD CONSTRAINT "ligne_devis_devis_id_devis_id_fk" FOREIGN KEY ("devis_id") REFERENCES "public"."devis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligne_facture" ADD CONSTRAINT "ligne_facture_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligne_facture" ADD CONSTRAINT "ligne_facture_facture_id_facture_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."facture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiement" ADD CONSTRAINT "paiement_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiement" ADD CONSTRAINT "paiement_facture_id_facture_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."facture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiement" ADD CONSTRAINT "paiement_saisi_par_id_utilisateur_id_fk" FOREIGN KEY ("saisi_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "avoir_facture_entreprise_idx" ON "avoir_facture" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devis_entreprise_numero_unique" ON "devis" USING btree ("entreprise_id","numero");--> statement-breakpoint
CREATE INDEX "devis_entreprise_idx" ON "devis" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "facture_entreprise_numero_unique" ON "facture" USING btree ("entreprise_id","numero");--> statement-breakpoint
CREATE INDEX "facture_entreprise_idx" ON "facture" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "facture_statut_idx" ON "facture" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "interaction_entreprise_idx" ON "interaction" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "interaction_prospect_idx" ON "interaction" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "ligne_devis_entreprise_idx" ON "ligne_devis" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "ligne_devis_devis_idx" ON "ligne_devis" USING btree ("devis_id");--> statement-breakpoint
CREATE INDEX "ligne_facture_entreprise_idx" ON "ligne_facture" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "ligne_facture_facture_idx" ON "ligne_facture" USING btree ("facture_id");--> statement-breakpoint
CREATE INDEX "paiement_entreprise_idx" ON "paiement" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "paiement_facture_idx" ON "paiement" USING btree ("facture_id");--> statement-breakpoint
CREATE INDEX "prospect_entreprise_idx" ON "prospect" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "prospect_assigne_a_idx" ON "prospect" USING btree ("assigne_a_id");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "avoir_facture" AS PERMISSIVE FOR ALL TO public USING ("avoir_facture"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("avoir_facture"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "devis" AS PERMISSIVE FOR ALL TO public USING ("devis"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("devis"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "facture" AS PERMISSIVE FOR ALL TO public USING ("facture"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("facture"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "interaction" AS PERMISSIVE FOR ALL TO public USING ("interaction"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("interaction"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "ligne_devis" AS PERMISSIVE FOR ALL TO public USING ("ligne_devis"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("ligne_devis"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "ligne_facture" AS PERMISSIVE FOR ALL TO public USING ("ligne_facture"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("ligne_facture"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "paiement" AS PERMISSIVE FOR ALL TO public USING ("paiement"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("paiement"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "prospect" AS PERMISSIVE FOR ALL TO public USING ("prospect"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("prospect"."entreprise_id" = current_setting('app.entreprise_id', true));
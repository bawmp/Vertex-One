ALTER TABLE "entreprise" ADD COLUMN "compteur_recus_vente" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

CREATE TYPE "public"."statut_recu_vente" AS ENUM('EMISE', 'ANNULE');--> statement-breakpoint

CREATE TABLE "recu_vente" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"numero" text NOT NULL,
	"deal_id" text NOT NULL,
	"statut" "statut_recu_vente" DEFAULT 'EMISE' NOT NULL,
	"date_emission" timestamp DEFAULT now() NOT NULL,
	"montant_ht" integer NOT NULL,
	"montant_tva" integer DEFAULT 0 NOT NULL,
	"montant_ttc" integer NOT NULL,
	"moyen_paiement" "moyen_paiement" NOT NULL,
	"reference_transaction" text,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recu_vente" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "ligne_recu_vente" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"recu_vente_id" text NOT NULL,
	"produit_id" text,
	"designation" text NOT NULL,
	"quantite" numeric(10, 2) NOT NULL,
	"prix_unitaire" integer NOT NULL,
	"taux_tva" numeric(5, 2) DEFAULT 19.25 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ligne_recu_vente" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "ecriture_comptable" ADD COLUMN "recu_vente_id" text;--> statement-breakpoint

ALTER TABLE "recu_vente" ADD CONSTRAINT "recu_vente_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recu_vente" ADD CONSTRAINT "recu_vente_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recu_vente" ADD CONSTRAINT "recu_vente_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "ligne_recu_vente" ADD CONSTRAINT "ligne_recu_vente_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligne_recu_vente" ADD CONSTRAINT "ligne_recu_vente_recu_vente_id_recu_vente_id_fk" FOREIGN KEY ("recu_vente_id") REFERENCES "public"."recu_vente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligne_recu_vente" ADD CONSTRAINT "ligne_recu_vente_produit_id_produit_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "recu_vente_entreprise_numero_unique" ON "recu_vente" USING btree ("entreprise_id","numero");--> statement-breakpoint
CREATE INDEX "recu_vente_entreprise_idx" ON "recu_vente" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "recu_vente_deal_idx" ON "recu_vente" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "ligne_recu_vente_entreprise_idx" ON "ligne_recu_vente" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "ligne_recu_vente_rv_idx" ON "ligne_recu_vente" USING btree ("recu_vente_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "recu_vente" AS PERMISSIVE FOR ALL TO public USING ("recu_vente"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("recu_vente"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "ligne_recu_vente" AS PERMISSIVE FOR ALL TO public USING ("ligne_recu_vente"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("ligne_recu_vente"."entreprise_id" = current_setting('app.entreprise_id', true));

ALTER TABLE "entreprise" ADD COLUMN "compteur_factures_acompte" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

CREATE TYPE "public"."statut_facture_acompte" AS ENUM('EMISE', 'PAYEE', 'APPLIQUEE', 'ANNULEE');--> statement-breakpoint

CREATE TABLE "facture_acompte" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"numero" text NOT NULL,
	"deal_id" text NOT NULL,
	"statut" "statut_facture_acompte" DEFAULT 'EMISE' NOT NULL,
	"date_emission" timestamp DEFAULT now() NOT NULL,
	"montant" integer NOT NULL,
	"montant_restant" integer NOT NULL,
	"moyen_paiement" "moyen_paiement",
	"reference_transaction" text,
	"date_encaissement" timestamp,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facture_acompte" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "ecriture_comptable" ADD COLUMN "facture_acompte_id" text;--> statement-breakpoint

ALTER TABLE "facture_acompte" ADD CONSTRAINT "facture_acompte_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture_acompte" ADD CONSTRAINT "facture_acompte_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture_acompte" ADD CONSTRAINT "facture_acompte_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "facture_acompte_entreprise_numero_unique" ON "facture_acompte" USING btree ("entreprise_id","numero");--> statement-breakpoint
CREATE INDEX "facture_acompte_entreprise_idx" ON "facture_acompte" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "facture_acompte_deal_idx" ON "facture_acompte" USING btree ("deal_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "facture_acompte" AS PERMISSIVE FOR ALL TO public USING ("facture_acompte"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("facture_acompte"."entreprise_id" = current_setting('app.entreprise_id', true));

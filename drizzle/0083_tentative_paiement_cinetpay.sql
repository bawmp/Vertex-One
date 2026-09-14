CREATE TYPE "public"."statut_tentative_paiement" AS ENUM('EN_ATTENTE', 'CONFIRME', 'ECHEC');--> statement-breakpoint
CREATE TABLE "tentative_paiement_facture" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"facture_id" text NOT NULL,
	"montant" integer NOT NULL,
	"statut" "statut_tentative_paiement" DEFAULT 'EN_ATTENTE' NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"confirme_le" timestamp
);
--> statement-breakpoint
ALTER TABLE "tentative_paiement_facture" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tentative_paiement_facture" ADD CONSTRAINT "tentative_paiement_facture_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tentative_paiement_facture" ADD CONSTRAINT "tentative_paiement_facture_facture_id_facture_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."facture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tentative_paiement_facture_entreprise_idx" ON "tentative_paiement_facture" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "tentative_paiement_facture_facture_idx" ON "tentative_paiement_facture" USING btree ("facture_id");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "tentative_paiement_facture" AS PERMISSIVE FOR ALL TO public USING ("tentative_paiement_facture"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("tentative_paiement_facture"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
ALTER TABLE "tentative_paiement_facture" FORCE ROW LEVEL SECURITY;

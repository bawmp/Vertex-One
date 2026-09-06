CREATE TABLE "classeur_document_financier" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classeur_document_financier" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "document_financier" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"cle_stockage" text NOT NULL,
	"type_mime" text NOT NULL,
	"taille_octets" integer NOT NULL,
	"classeur_id" text,
	"facture_id" text,
	"paiement_id" text,
	"fournisseur_ou_vendeur" text,
	"montant" integer,
	"date_document" timestamp,
	"televerse_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_financier" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "classeur_document_financier" ADD CONSTRAINT "classeur_document_financier_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classeur_document_financier" ADD CONSTRAINT "classeur_document_financier_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "document_financier" ADD CONSTRAINT "document_financier_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_financier" ADD CONSTRAINT "document_financier_classeur_id_classeur_document_financier_id_fk" FOREIGN KEY ("classeur_id") REFERENCES "public"."classeur_document_financier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_financier" ADD CONSTRAINT "document_financier_facture_id_facture_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."facture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_financier" ADD CONSTRAINT "document_financier_paiement_id_paiement_id_fk" FOREIGN KEY ("paiement_id") REFERENCES "public"."paiement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_financier" ADD CONSTRAINT "document_financier_televerse_par_id_utilisateur_id_fk" FOREIGN KEY ("televerse_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "classeur_document_financier_entreprise_idx" ON "classeur_document_financier" USING btree ("entreprise_id");--> statement-breakpoint

CREATE INDEX "document_financier_entreprise_idx" ON "document_financier" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "document_financier_classeur_idx" ON "document_financier" USING btree ("classeur_id");--> statement-breakpoint
CREATE INDEX "document_financier_facture_idx" ON "document_financier" USING btree ("facture_id");--> statement-breakpoint
CREATE INDEX "document_financier_paiement_idx" ON "document_financier" USING btree ("paiement_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "classeur_document_financier" AS PERMISSIVE FOR ALL TO public USING ("classeur_document_financier"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("classeur_document_financier"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "document_financier" AS PERMISSIVE FOR ALL TO public USING ("document_financier"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("document_financier"."entreprise_id" = current_setting('app.entreprise_id', true));

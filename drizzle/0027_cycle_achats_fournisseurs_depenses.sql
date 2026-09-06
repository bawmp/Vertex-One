CREATE TABLE "fournisseur" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"niu" text,
	"telephone" text NOT NULL,
	"email" text,
	"adresse" text,
	"notes" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fournisseur" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "depense" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"libelle" text NOT NULL,
	"compte_comptable_id" text NOT NULL,
	"fournisseur_id" text,
	"montant_ht" integer NOT NULL,
	"montant_tva" integer DEFAULT 0 NOT NULL,
	"montant_ttc" integer NOT NULL,
	"moyen_paiement" "moyen_paiement" NOT NULL,
	"refacturable" boolean DEFAULT false NOT NULL,
	"deal_id" text,
	"date_paiement" timestamp NOT NULL,
	"assigne_a_id" text NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "depense" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "ecriture_comptable" ADD COLUMN "depense_id" text;--> statement-breakpoint

ALTER TABLE "fournisseur" ADD CONSTRAINT "fournisseur_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depense" ADD CONSTRAINT "depense_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depense" ADD CONSTRAINT "depense_compte_comptable_id_compte_comptable_id_fk" FOREIGN KEY ("compte_comptable_id") REFERENCES "public"."compte_comptable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depense" ADD CONSTRAINT "depense_fournisseur_id_fournisseur_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."fournisseur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depense" ADD CONSTRAINT "depense_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depense" ADD CONSTRAINT "depense_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depense" ADD CONSTRAINT "depense_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "fournisseur_entreprise_idx" ON "fournisseur" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "depense_entreprise_idx" ON "depense" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "depense_assigne_idx" ON "depense" USING btree ("assigne_a_id");--> statement-breakpoint
CREATE INDEX "depense_fournisseur_idx" ON "depense" USING btree ("fournisseur_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "fournisseur" AS PERMISSIVE FOR ALL TO public USING ("fournisseur"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("fournisseur"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "depense" AS PERMISSIVE FOR ALL TO public USING ("depense"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("depense"."entreprise_id" = current_setting('app.entreprise_id', true));

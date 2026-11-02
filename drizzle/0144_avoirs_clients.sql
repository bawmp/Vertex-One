ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "compteur_avoirs_client" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "avoir_client" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"facture_id" text NOT NULL,
	"numero" text NOT NULL,
	"motif" text NOT NULL,
	"montant_ht" integer NOT NULL,
	"montant_tva" integer NOT NULL,
	"montant_ttc" integer NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "avoir_client" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "avoir_client" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "avoir_client" ADD CONSTRAINT "avoir_client_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "avoir_client" ADD CONSTRAINT "avoir_client_facture_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."facture"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "avoir_client" ADD CONSTRAINT "avoir_client_cree_par_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "avoir_client_entreprise_numero_unique" ON "avoir_client" USING btree ("entreprise_id","numero");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "avoir_client_entreprise_idx" ON "avoir_client" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "avoir_client_facture_idx" ON "avoir_client" USING btree ("facture_id");--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "avoir_client" AS PERMISSIVE FOR ALL TO public USING ("avoir_client"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("avoir_client"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ligne_avoir_client" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"avoir_id" text NOT NULL,
	"ligne_facture_id" text NOT NULL,
	"produit_id" text,
	"designation" text NOT NULL,
	"quantite" numeric(10, 2) NOT NULL,
	"prix_unitaire" integer NOT NULL,
	"taux_tva" numeric(5, 2) NOT NULL,
	"remettre_en_stock" boolean DEFAULT false NOT NULL
);--> statement-breakpoint
ALTER TABLE "ligne_avoir_client" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ligne_avoir_client" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ligne_avoir_client" ADD CONSTRAINT "ligne_avoir_client_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ligne_avoir_client" ADD CONSTRAINT "ligne_avoir_client_avoir_id_fk" FOREIGN KEY ("avoir_id") REFERENCES "public"."avoir_client"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ligne_avoir_client" ADD CONSTRAINT "ligne_avoir_client_ligne_facture_id_fk" FOREIGN KEY ("ligne_facture_id") REFERENCES "public"."ligne_facture"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ligne_avoir_client" ADD CONSTRAINT "ligne_avoir_client_produit_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produit"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ligne_avoir_client_entreprise_idx" ON "ligne_avoir_client" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ligne_avoir_client_avoir_idx" ON "ligne_avoir_client" USING btree ("avoir_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ligne_avoir_client_ligne_facture_idx" ON "ligne_avoir_client" USING btree ("ligne_facture_id");--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "ligne_avoir_client" AS PERMISSIVE FOR ALL TO public USING ("ligne_avoir_client"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("ligne_avoir_client"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;

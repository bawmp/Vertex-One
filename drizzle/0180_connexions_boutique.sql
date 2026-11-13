-- Connexions automatiques à une boutique en ligne (WooCommerce, échange de fichiers) (2026-11-12).
ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "synchro_boutique_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connexion_boutique" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"type" text NOT NULL,
	"nom" text NOT NULL,
	"depot_id" text,
	"config_chiffree" text,
	"statut" text DEFAULT 'ACTIVE' NOT NULL,
	"derniere_erreur" text,
	"dernier_cycle_le" timestamp,
	"curseur" text,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"archivee_le" timestamp
);--> statement-breakpoint
ALTER TABLE "connexion_boutique" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "connexion_boutique" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "connexion_boutique" AS PERMISSIVE FOR ALL TO public USING ("connexion_boutique"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("connexion_boutique"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connexion_boutique" ADD CONSTRAINT "connexion_boutique_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connexion_boutique" ADD CONSTRAINT "connexion_boutique_depot_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depot"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connexion_boutique" ADD CONSTRAINT "connexion_boutique_cree_par_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connexion_boutique_entreprise_idx" ON "connexion_boutique" USING btree ("entreprise_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_pousse" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"connexion_id" text NOT NULL,
	"produit_id" text NOT NULL,
	"quantite" integer NOT NULL,
	"mis_a_jour_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "stock_pousse" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_pousse" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "stock_pousse" AS PERMISSIVE FOR ALL TO public USING ("stock_pousse"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("stock_pousse"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_pousse" ADD CONSTRAINT "stock_pousse_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_pousse" ADD CONSTRAINT "stock_pousse_connexion_id_fk" FOREIGN KEY ("connexion_id") REFERENCES "public"."connexion_boutique"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_pousse" ADD CONSTRAINT "stock_pousse_produit_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produit"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_pousse_entreprise_idx" ON "stock_pousse" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stock_pousse_connexion_produit_unique" ON "stock_pousse" USING btree ("connexion_id","produit_id");--> statement-breakpoint
ALTER TABLE "commande_site" ADD COLUMN IF NOT EXISTS "connexion_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commande_site" ADD CONSTRAINT "commande_site_connexion_id_fk" FOREIGN KEY ("connexion_id") REFERENCES "public"."connexion_boutique"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "commande_site_connexion_reference_unique" ON "commande_site" USING btree ("connexion_id","reference");

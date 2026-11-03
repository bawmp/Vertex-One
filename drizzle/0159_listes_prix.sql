CREATE TABLE IF NOT EXISTS "liste_prix" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"remise_pourcent" integer DEFAULT 0 NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prix_liste" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"liste_id" text NOT NULL,
	"produit_id" text NOT NULL,
	"prix" integer NOT NULL
);--> statement-breakpoint
ALTER TABLE "liste_prix" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "liste_prix" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prix_liste" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prix_liste" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "liste_prix" AS PERMISSIVE FOR ALL TO public USING ("liste_prix"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("liste_prix"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "prix_liste" AS PERMISSIVE FOR ALL TO public USING ("prix_liste"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("prix_liste"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "liste_prix" ADD CONSTRAINT "liste_prix_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prix_liste" ADD CONSTRAINT "prix_liste_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prix_liste" ADD CONSTRAINT "prix_liste_liste_id_fk" FOREIGN KEY ("liste_id") REFERENCES "public"."liste_prix"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prix_liste" ADD CONSTRAINT "prix_liste_produit_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produit"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "liste_prix_entreprise_idx" ON "liste_prix" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "liste_prix_nom_unique" ON "liste_prix" USING btree ("entreprise_id","nom");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prix_liste_entreprise_idx" ON "prix_liste" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prix_liste_unique" ON "prix_liste" USING btree ("liste_id","produit_id");--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "liste_prix_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact" ADD CONSTRAINT "contact_liste_prix_id_fk" FOREIGN KEY ("liste_prix_id") REFERENCES "public"."liste_prix"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 CREATE TYPE "public"."statut_inventaire_session" AS ENUM('OUVERT', 'VALIDE', 'ANNULE');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventaire_session" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"depot_id" text NOT NULL,
	"statut" "statut_inventaire_session" DEFAULT 'OUVERT' NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"termine_par_id" text,
	"termine_le" timestamp,
	"nombre_corriges" integer
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventaire_comptage" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"session_id" text NOT NULL,
	"produit_id" text NOT NULL,
	"quantite_comptee" integer NOT NULL,
	"quantite_theorique" integer NOT NULL,
	"compte_par" text NOT NULL,
	"compte_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "inventaire_session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventaire_session" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "inventaire_session" AS PERMISSIVE FOR ALL TO public USING ("inventaire_session"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("inventaire_session"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventaire_session_entreprise_idx" ON "inventaire_session" USING btree ("entreprise_id");--> statement-breakpoint
ALTER TABLE "inventaire_comptage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventaire_comptage" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "inventaire_comptage" AS PERMISSIVE FOR ALL TO public USING ("inventaire_comptage"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("inventaire_comptage"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventaire_comptage_entreprise_idx" ON "inventaire_comptage" USING btree ("entreprise_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventaire_session" ADD CONSTRAINT "inventaire_session_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventaire_session" ADD CONSTRAINT "inventaire_session_depot_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depot"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventaire_session" ADD CONSTRAINT "inventaire_session_cree_par_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventaire_session" ADD CONSTRAINT "inventaire_session_termine_par_id_fk" FOREIGN KEY ("termine_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventaire_comptage" ADD CONSTRAINT "inventaire_comptage_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventaire_comptage" ADD CONSTRAINT "inventaire_comptage_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."inventaire_session"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventaire_comptage" ADD CONSTRAINT "inventaire_comptage_produit_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produit"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventaire_comptage" ADD CONSTRAINT "inventaire_comptage_compte_par_fk" FOREIGN KEY ("compte_par") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventaire_comptage_session_produit_unique" ON "inventaire_comptage" USING btree ("session_id","produit_id");

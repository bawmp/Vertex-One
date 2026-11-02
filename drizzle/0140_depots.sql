ALTER TYPE "public"."type_mouvement_stock" ADD VALUE IF NOT EXISTS 'TRANSFERT_SORTIE';--> statement-breakpoint
ALTER TYPE "public"."type_mouvement_stock" ADD VALUE IF NOT EXISTS 'TRANSFERT_ENTREE';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "depot" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"principal" boolean DEFAULT false NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "depot" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "depot" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "depot" ADD CONSTRAINT "depot_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "depot_entreprise_idx" ON "depot" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "depot_entreprise_nom_unique" ON "depot" USING btree ("entreprise_id","nom");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "depot_principal_unique" ON "depot" USING btree ("entreprise_id") WHERE "depot"."principal";--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "depot" AS PERMISSIVE FOR ALL TO public USING ("depot"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("depot"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_depot" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"produit_id" text NOT NULL,
	"depot_id" text NOT NULL,
	"quantite" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
ALTER TABLE "stock_depot" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_depot" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_depot" ADD CONSTRAINT "stock_depot_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_depot" ADD CONSTRAINT "stock_depot_produit_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produit"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_depot" ADD CONSTRAINT "stock_depot_depot_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depot"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_depot_entreprise_idx" ON "stock_depot" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stock_depot_produit_depot_unique" ON "stock_depot" USING btree ("produit_id","depot_id");--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "stock_depot" AS PERMISSIVE FOR ALL TO public USING ("stock_depot"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("stock_depot"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TABLE "mouvement_stock" ADD COLUMN IF NOT EXISTS "depot_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_depot_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depot"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
INSERT INTO "depot" ("id", "entreprise_id", "nom", "principal") SELECT 'depot-' || e."id", e."id", 'Dépôt principal', true FROM "entreprise" e WHERE NOT EXISTS (SELECT 1 FROM "depot" d WHERE d."entreprise_id" = e."id");--> statement-breakpoint
INSERT INTO "stock_depot" ("id", "entreprise_id", "produit_id", "depot_id", "quantite") SELECT 'sd-' || p."id", p."entreprise_id", p."id", d."id", p."stock_actuel" FROM "produit" p JOIN "depot" d ON d."entreprise_id" = p."entreprise_id" AND d."principal" WHERE p."suivi_stock" = true AND NOT EXISTS (SELECT 1 FROM "stock_depot" sd WHERE sd."produit_id" = p."id");

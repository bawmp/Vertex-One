DO $$ BEGIN
 CREATE TYPE "public"."type_mouvement_stock" AS ENUM('INITIAL', 'VENTE', 'ACHAT', 'AJOUT', 'RETRAIT', 'INVENTAIRE');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mouvement_stock" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"produit_id" text NOT NULL,
	"type" "type_mouvement_stock" NOT NULL,
	"quantite" integer NOT NULL,
	"stock_apres" integer NOT NULL,
	"motif" text,
	"note" text,
	"document_type" text,
	"document_id" text,
	"cree_par_id" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "mouvement_stock" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mouvement_stock" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_produit_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produit"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_cree_par_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mouvement_stock_entreprise_idx" ON "mouvement_stock" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mouvement_stock_produit_date_idx" ON "mouvement_stock" USING btree ("produit_id","cree_le");--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "mouvement_stock" AS PERMISSIVE FOR ALL TO public USING ("mouvement_stock"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("mouvement_stock"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;

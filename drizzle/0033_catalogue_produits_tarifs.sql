CREATE TYPE "public"."type_produit" AS ENUM('BIEN', 'SERVICE');--> statement-breakpoint

CREATE TABLE "produit" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"type" "type_produit" DEFAULT 'SERVICE' NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"prix_vente" integer DEFAULT 0 NOT NULL,
	"prix_achat" integer DEFAULT 0 NOT NULL,
	"suivi_stock" boolean DEFAULT false NOT NULL,
	"stock_actuel" integer DEFAULT 0 NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "produit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "ligne_devis" ADD COLUMN "produit_id" text;--> statement-breakpoint
ALTER TABLE "ligne_facture" ADD COLUMN "produit_id" text;--> statement-breakpoint

ALTER TABLE "produit" ADD CONSTRAINT "produit_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligne_devis" ADD CONSTRAINT "ligne_devis_produit_id_produit_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligne_facture" ADD CONSTRAINT "ligne_facture_produit_id_produit_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "produit_entreprise_idx" ON "produit" USING btree ("entreprise_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "produit" AS PERMISSIVE FOR ALL TO public USING ("produit"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("produit"."entreprise_id" = current_setting('app.entreprise_id', true));

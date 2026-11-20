-- Chaque entreprise branche SON PROPRE compte ElyonPay (2026-11-20) : les paiements Mobile Money de ses clients vont directement sur ce compte. Rejouable.
CREATE TABLE IF NOT EXISTS "compte_elyonpay" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"marchand_id" integer NOT NULL,
	"nom_marchand" text NOT NULL,
	"config_chiffree" text NOT NULL,
	"cle_fin" text NOT NULL,
	"statut" text DEFAULT 'ACTIF' NOT NULL,
	"derniere_erreur" text,
	"verifie_le" timestamp,
	"cree_par_id" text,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"modifie_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "compte_elyonpay" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "compte_elyonpay" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "compte_elyonpay" AS PERMISSIVE FOR ALL TO public USING ("compte_elyonpay"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("compte_elyonpay"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compte_elyonpay" ADD CONSTRAINT "compte_elyonpay_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compte_elyonpay" ADD CONSTRAINT "compte_elyonpay_cree_par_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "compte_elyonpay_entreprise_unique" ON "compte_elyonpay" USING btree ("entreprise_id");--> statement-breakpoint
-- Sur quel compte une tentative de paiement de facture a été faite : "PLATEFORME" (ancien circuit, compte de Vertex One) pour tout l'existant, "ENTREPRISE" pour les nouvelles.
ALTER TABLE "tentative_paiement_facture" ADD COLUMN IF NOT EXISTS "compte" text DEFAULT 'PLATEFORME' NOT NULL;

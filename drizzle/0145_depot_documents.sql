ALTER TABLE "devis" ADD COLUMN IF NOT EXISTS "depot_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "devis" ADD CONSTRAINT "devis_depot_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depot"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TABLE "facture" ADD COLUMN IF NOT EXISTS "depot_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "facture" ADD CONSTRAINT "facture_depot_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depot"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TABLE "bon_commande_vente" ADD COLUMN IF NOT EXISTS "depot_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bon_commande_vente" ADD CONSTRAINT "bon_commande_vente_depot_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depot"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TABLE "facture_recurrente" ADD COLUMN IF NOT EXISTS "depot_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "facture_recurrente" ADD CONSTRAINT "facture_recurrente_depot_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depot"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TABLE "recu_vente" ADD COLUMN IF NOT EXISTS "depot_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recu_vente" ADD CONSTRAINT "recu_vente_depot_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depot"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TABLE "bon_commande_achat" ADD COLUMN IF NOT EXISTS "depot_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bon_commande_achat" ADD CONSTRAINT "bon_commande_achat_depot_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depot"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TABLE "facture_fournisseur" ADD COLUMN IF NOT EXISTS "depot_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "facture_fournisseur" ADD CONSTRAINT "facture_fournisseur_depot_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depot"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

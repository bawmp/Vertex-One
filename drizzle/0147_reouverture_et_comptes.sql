ALTER TABLE "cloture_exercice" ADD COLUMN IF NOT EXISTS "verrou_avant" timestamp;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reouverture_exercice" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"annee" integer NOT NULL,
	"motif" text NOT NULL,
	"resultat_annule" integer NOT NULL,
	"rouvert_par" text NOT NULL,
	"rouvert_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "reouverture_exercice" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reouverture_exercice" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reouverture_exercice" ADD CONSTRAINT "reouverture_exercice_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reouverture_exercice" ADD CONSTRAINT "reouverture_exercice_rouvert_par_fk" FOREIGN KEY ("rouvert_par") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reouverture_exercice_entreprise_idx" ON "reouverture_exercice" USING btree ("entreprise_id");--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "reouverture_exercice" AS PERMISSIVE FOR ALL TO public USING ("reouverture_exercice"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("reouverture_exercice"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
INSERT INTO "compte_comptable" ("id", "numero", "libelle", "classe") SELECT 'syscohada-' || v.numero, v.numero, v.libelle, v.classe FROM (VALUES
 ('191000', 'Provisions pour litiges', 1),
 ('244000', 'Matériel et mobilier', 2),
 ('244100', 'Matériel informatique', 2),
 ('245000', 'Matériel de transport', 2),
 ('284000', 'Amortissements du matériel et mobilier', 2),
 ('284100', 'Amortissements du matériel informatique', 2),
 ('284500', 'Amortissements du matériel de transport', 2),
 ('408000', 'Fournisseurs, factures non parvenues', 4),
 ('418000', 'Clients, produits à recevoir', 4),
 ('476000', 'Charges constatées d''avance', 4),
 ('477000', 'Produits constatés d''avance', 4),
 ('691000', 'Dotations aux provisions d''exploitation', 6)
) AS v(numero, libelle, classe) WHERE NOT EXISTS (SELECT 1 FROM "compte_comptable" c WHERE c."numero" = v.numero AND c."entreprise_id" IS NULL);

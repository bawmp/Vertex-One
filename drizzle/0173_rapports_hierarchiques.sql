CREATE TABLE IF NOT EXISTS "rapport_hierarchique" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"auteur_id" text NOT NULL,
	"destinataire_id" text NOT NULL,
	"objet" text NOT NULL,
	"contenu" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"lu_le" timestamp
);--> statement-breakpoint
ALTER TABLE "rapport_hierarchique" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rapport_hierarchique" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "rapport_hierarchique" AS PERMISSIVE FOR ALL TO public USING ("rapport_hierarchique"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("rapport_hierarchique"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rapport_hierarchique" ADD CONSTRAINT "rapport_hierarchique_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rapport_hierarchique" ADD CONSTRAINT "rapport_hierarchique_auteur_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rapport_hierarchique" ADD CONSTRAINT "rapport_hierarchique_destinataire_id_fk" FOREIGN KEY ("destinataire_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rapport_hierarchique_entreprise_idx" ON "rapport_hierarchique" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rapport_hierarchique_auteur_idx" ON "rapport_hierarchique" USING btree ("auteur_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rapport_hierarchique_destinataire_idx" ON "rapport_hierarchique" USING btree ("destinataire_id");

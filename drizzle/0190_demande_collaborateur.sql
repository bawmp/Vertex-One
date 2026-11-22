CREATE TABLE IF NOT EXISTS "demande_collaborateur" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"demande_par_id" text NOT NULL,
	"email" text NOT NULL,
	"poste" text NOT NULL,
	"type_contrat" text NOT NULL,
	"date_embauche" text NOT NULL,
	"date_fin" text,
	"date_naissance" text,
	"responsable_id" text,
	"statut" text DEFAULT 'EN_ATTENTE' NOT NULL,
	"motif_refus" text,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"decide_le" timestamp,
	"decide_par_id" text,
	"invitation_id" text
);--> statement-breakpoint
ALTER TABLE "demande_collaborateur" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "demande_collaborateur" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "demande_collaborateur" AS PERMISSIVE FOR ALL TO public USING ("demande_collaborateur"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("demande_collaborateur"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demande_collaborateur" ADD CONSTRAINT "demande_collaborateur_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demande_collaborateur" ADD CONSTRAINT "demande_collaborateur_demande_par_id_fk" FOREIGN KEY ("demande_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "demande_collaborateur_entreprise_idx" ON "demande_collaborateur" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "demande_collaborateur_en_attente_unique" ON "demande_collaborateur" USING btree ("entreprise_id","email") WHERE "demande_collaborateur"."statut" = 'EN_ATTENTE';

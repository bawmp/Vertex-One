CREATE TABLE IF NOT EXISTS "transfert_employe" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"sens" text NOT NULL,
	"transfert_id" text NOT NULL,
	"entreprise_source_id" text NOT NULL,
	"entreprise_cible_id" text NOT NULL,
	"nom_entreprise_source" text NOT NULL,
	"nom_entreprise_cible" text NOT NULL,
	"utilisateur_source_id" text NOT NULL,
	"nom_personne" text NOT NULL,
	"poste" text,
	"role_personne" text NOT NULL,
	"message" text,
	"statut" text DEFAULT 'EN_ATTENTE' NOT NULL,
	"propose_par_id" text NOT NULL,
	"nom_propose_par" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"decide_le" timestamp,
	"motif_decision" text,
	"nouvel_utilisateur_id" text
);--> statement-breakpoint
ALTER TABLE "transfert_employe" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transfert_employe" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "isolation_entreprise" ON "transfert_employe" AS PERMISSIVE FOR ALL TO public USING ("transfert_employe"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("transfert_employe"."entreprise_id" = current_setting('app.entreprise_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfert_employe" ADD CONSTRAINT "transfert_employe_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfert_employe" ADD CONSTRAINT "transfert_employe_source_fk" FOREIGN KEY ("entreprise_source_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfert_employe" ADD CONSTRAINT "transfert_employe_cible_fk" FOREIGN KEY ("entreprise_cible_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfert_employe" ADD CONSTRAINT "transfert_employe_utilisateur_source_fk" FOREIGN KEY ("utilisateur_source_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfert_employe" ADD CONSTRAINT "transfert_employe_propose_par_fk" FOREIGN KEY ("propose_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transfert_employe_entreprise_idx" ON "transfert_employe" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transfert_employe_transfert_idx" ON "transfert_employe" USING btree ("transfert_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transfert_employe_en_attente_unique" ON "transfert_employe" USING btree ("utilisateur_source_id","sens") WHERE "transfert_employe"."statut" = 'EN_ATTENTE';

-- Custom SQL migration file, put your code below! --
CREATE TYPE "public"."type_champ_formulaire" AS ENUM('TEXTE_COURT', 'TEXTE_LONG', 'EMAIL', 'TELEPHONE', 'NOMBRE', 'DATE', 'CHOIX_UNIQUE', 'CHOIX_MULTIPLE', 'LISTE_DEROULANTE');
--> statement-breakpoint
CREATE TABLE "formulaire" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"titre" text NOT NULL,
	"description" text,
	"slug" text NOT NULL,
	"publie" boolean DEFAULT false NOT NULL,
	"message_confirmation" text DEFAULT 'Merci, votre réponse a bien été enregistrée.' NOT NULL,
	"creer_lead_a_la_reponse" boolean DEFAULT false NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "formulaire_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "formulaire" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "champ_formulaire" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"formulaire_id" text NOT NULL,
	"type" "type_champ_formulaire" NOT NULL,
	"libelle" text NOT NULL,
	"obligatoire" boolean DEFAULT false NOT NULL,
	"options" json,
	"ordre" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "champ_formulaire" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reponse_formulaire" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"formulaire_id" text NOT NULL,
	"lead_id" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reponse_formulaire" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "valeur_champ_reponse" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"reponse_formulaire_id" text NOT NULL,
	"champ_formulaire_id" text NOT NULL,
	"valeur" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "valeur_champ_reponse" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "formulaire" ADD CONSTRAINT "formulaire_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulaire" ADD CONSTRAINT "formulaire_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "champ_formulaire" ADD CONSTRAINT "champ_formulaire_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "champ_formulaire" ADD CONSTRAINT "champ_formulaire_formulaire_id_formulaire_id_fk" FOREIGN KEY ("formulaire_id") REFERENCES "public"."formulaire"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reponse_formulaire" ADD CONSTRAINT "reponse_formulaire_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reponse_formulaire" ADD CONSTRAINT "reponse_formulaire_formulaire_id_formulaire_id_fk" FOREIGN KEY ("formulaire_id") REFERENCES "public"."formulaire"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reponse_formulaire" ADD CONSTRAINT "reponse_formulaire_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valeur_champ_reponse" ADD CONSTRAINT "valeur_champ_reponse_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valeur_champ_reponse" ADD CONSTRAINT "valeur_champ_reponse_reponse_formulaire_id_reponse_formulaire_id_fk" FOREIGN KEY ("reponse_formulaire_id") REFERENCES "public"."reponse_formulaire"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valeur_champ_reponse" ADD CONSTRAINT "valeur_champ_reponse_champ_formulaire_id_champ_formulaire_id_fk" FOREIGN KEY ("champ_formulaire_id") REFERENCES "public"."champ_formulaire"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "formulaire_entreprise_idx" ON "formulaire" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "champ_formulaire_entreprise_idx" ON "champ_formulaire" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "champ_formulaire_formulaire_idx" ON "champ_formulaire" USING btree ("formulaire_id");--> statement-breakpoint
CREATE INDEX "reponse_formulaire_entreprise_idx" ON "reponse_formulaire" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "reponse_formulaire_formulaire_idx" ON "reponse_formulaire" USING btree ("formulaire_id");--> statement-breakpoint
CREATE INDEX "valeur_champ_reponse_entreprise_idx" ON "valeur_champ_reponse" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "valeur_champ_reponse_reponse_idx" ON "valeur_champ_reponse" USING btree ("reponse_formulaire_id");--> statement-breakpoint
CREATE POLICY "lecture_publique_ou_entreprise" ON "formulaire" AS PERMISSIVE FOR SELECT TO public USING ("formulaire"."entreprise_id" = current_setting('app.entreprise_id', true) OR ("formulaire"."publie" = true AND nullif(current_setting('app.entreprise_id', true), '') IS NULL));--> statement-breakpoint
CREATE POLICY "ecriture_entreprise" ON "formulaire" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("formulaire"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "modification_entreprise" ON "formulaire" AS PERMISSIVE FOR UPDATE TO public USING ("formulaire"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("formulaire"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "suppression_entreprise" ON "formulaire" AS PERMISSIVE FOR DELETE TO public USING ("formulaire"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "lecture_publique_ou_entreprise" ON "champ_formulaire" AS PERMISSIVE FOR SELECT TO public USING ("champ_formulaire"."entreprise_id" = current_setting('app.entreprise_id', true) OR (nullif(current_setting('app.entreprise_id', true), '') IS NULL AND EXISTS (SELECT 1 FROM "formulaire" WHERE "formulaire"."id" = "champ_formulaire"."formulaire_id" AND "formulaire"."publie" = true)));--> statement-breakpoint
CREATE POLICY "ecriture_entreprise" ON "champ_formulaire" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("champ_formulaire"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "modification_entreprise" ON "champ_formulaire" AS PERMISSIVE FOR UPDATE TO public USING ("champ_formulaire"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("champ_formulaire"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "suppression_entreprise" ON "champ_formulaire" AS PERMISSIVE FOR DELETE TO public USING ("champ_formulaire"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "reponse_formulaire" AS PERMISSIVE FOR ALL TO public USING ("reponse_formulaire"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("reponse_formulaire"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "valeur_champ_reponse" AS PERMISSIVE FOR ALL TO public USING ("valeur_champ_reponse"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("valeur_champ_reponse"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
ALTER TABLE "formulaire" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "champ_formulaire" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reponse_formulaire" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "valeur_champ_reponse" FORCE ROW LEVEL SECURITY;

CREATE TYPE "public"."statut_sondage" AS ENUM('BROUILLON', 'OUVERT', 'FERME');--> statement-breakpoint
CREATE TYPE "public"."type_question_sondage" AS ENUM('NPS', 'ETOILES', 'TEXTE');--> statement-breakpoint

CREATE TABLE "sondage" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"titre" text NOT NULL,
	"statut" "statut_sondage" DEFAULT 'BROUILLON' NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sondage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "sondage_question" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"sondage_id" text NOT NULL,
	"ordre" integer NOT NULL,
	"libelle" text NOT NULL,
	"type" "type_question_sondage" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sondage_question" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "sondage_reponse" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"sondage_id" text NOT NULL,
	"question_id" text NOT NULL,
	"valeur" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sondage_reponse" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "sondage_participation" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"sondage_id" text NOT NULL,
	"utilisateur_id" text NOT NULL,
	"repondu_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sondage_participation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "sondage" ADD CONSTRAINT "sondage_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sondage" ADD CONSTRAINT "sondage_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sondage_question" ADD CONSTRAINT "sondage_question_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sondage_question" ADD CONSTRAINT "sondage_question_sondage_id_sondage_id_fk" FOREIGN KEY ("sondage_id") REFERENCES "public"."sondage"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sondage_reponse" ADD CONSTRAINT "sondage_reponse_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sondage_reponse" ADD CONSTRAINT "sondage_reponse_sondage_id_sondage_id_fk" FOREIGN KEY ("sondage_id") REFERENCES "public"."sondage"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sondage_reponse" ADD CONSTRAINT "sondage_reponse_question_id_sondage_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."sondage_question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sondage_participation" ADD CONSTRAINT "sondage_participation_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sondage_participation" ADD CONSTRAINT "sondage_participation_sondage_id_sondage_id_fk" FOREIGN KEY ("sondage_id") REFERENCES "public"."sondage"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sondage_participation" ADD CONSTRAINT "sondage_participation_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "sondage_entreprise_idx" ON "sondage" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "sondage_question_entreprise_idx" ON "sondage_question" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "sondage_question_sondage_idx" ON "sondage_question" USING btree ("sondage_id");--> statement-breakpoint
CREATE INDEX "sondage_reponse_entreprise_idx" ON "sondage_reponse" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "sondage_reponse_sondage_idx" ON "sondage_reponse" USING btree ("sondage_id");--> statement-breakpoint
CREATE INDEX "sondage_reponse_question_idx" ON "sondage_reponse" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sondage_participation_sondage_utilisateur_unique" ON "sondage_participation" USING btree ("sondage_id","utilisateur_id");--> statement-breakpoint
CREATE INDEX "sondage_participation_entreprise_idx" ON "sondage_participation" USING btree ("entreprise_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "sondage" AS PERMISSIVE FOR ALL TO public USING ("sondage"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("sondage"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "sondage_question" AS PERMISSIVE FOR ALL TO public USING ("sondage_question"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("sondage_question"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "sondage_reponse" AS PERMISSIVE FOR ALL TO public USING ("sondage_reponse"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("sondage_reponse"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "sondage_participation" AS PERMISSIVE FOR ALL TO public USING ("sondage_participation"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("sondage_participation"."entreprise_id" = current_setting('app.entreprise_id', true));

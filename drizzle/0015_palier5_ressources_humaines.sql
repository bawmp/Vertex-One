CREATE TYPE "public"."statut_demande_conge" AS ENUM('EN_ATTENTE', 'APPROUVEE', 'REFUSEE');--> statement-breakpoint
CREATE TYPE "public"."statut_pointage" AS ENUM('PRESENT', 'ABSENT', 'RETARD', 'CONGE');--> statement-breakpoint
CREATE TYPE "public"."type_conge" AS ENUM('CONGE_PAYE', 'MALADIE', 'SANS_SOLDE', 'AUTRE');--> statement-breakpoint
CREATE TABLE "demande_conge" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"dossier_rh_id" text NOT NULL,
	"type" "type_conge" NOT NULL,
	"date_debut" timestamp NOT NULL,
	"date_fin" timestamp NOT NULL,
	"nombre_jours" numeric(5, 1) NOT NULL,
	"statut" "statut_demande_conge" DEFAULT 'EN_ATTENTE' NOT NULL,
	"approuve_par_id" text,
	"motif" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demande_conge" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evaluation" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"dossier_rh_id" text NOT NULL,
	"evaluateur_id" text NOT NULL,
	"periode" text NOT NULL,
	"commentaire" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evaluation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pointage" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"dossier_rh_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"heure_arrivee" timestamp,
	"heure_depart" timestamp,
	"statut" "statut_pointage" DEFAULT 'PRESENT' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pointage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dossier_rh" ADD COLUMN "date_fin_contrat" timestamp;--> statement-breakpoint
ALTER TABLE "dossier_rh" ADD COLUMN "salaire_base" integer;--> statement-breakpoint
ALTER TABLE "dossier_rh" ADD COLUMN "nombre_personnes_a_charge" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dossier_rh" ADD COLUMN "solde_conges" numeric(5, 1) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "demande_conge" ADD CONSTRAINT "demande_conge_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demande_conge" ADD CONSTRAINT "demande_conge_dossier_rh_id_dossier_rh_id_fk" FOREIGN KEY ("dossier_rh_id") REFERENCES "public"."dossier_rh"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demande_conge" ADD CONSTRAINT "demande_conge_approuve_par_id_utilisateur_id_fk" FOREIGN KEY ("approuve_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_dossier_rh_id_dossier_rh_id_fk" FOREIGN KEY ("dossier_rh_id") REFERENCES "public"."dossier_rh"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_evaluateur_id_utilisateur_id_fk" FOREIGN KEY ("evaluateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pointage" ADD CONSTRAINT "pointage_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pointage" ADD CONSTRAINT "pointage_dossier_rh_id_dossier_rh_id_fk" FOREIGN KEY ("dossier_rh_id") REFERENCES "public"."dossier_rh"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demande_conge_entreprise_idx" ON "demande_conge" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "demande_conge_dossier_rh_idx" ON "demande_conge" USING btree ("dossier_rh_id");--> statement-breakpoint
CREATE INDEX "evaluation_entreprise_idx" ON "evaluation" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "evaluation_dossier_rh_idx" ON "evaluation" USING btree ("dossier_rh_id");--> statement-breakpoint
CREATE INDEX "pointage_entreprise_idx" ON "pointage" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pointage_dossier_rh_date_unique" ON "pointage" USING btree ("dossier_rh_id","date");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "demande_conge" AS PERMISSIVE FOR ALL TO public USING ("demande_conge"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("demande_conge"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "evaluation" AS PERMISSIVE FOR ALL TO public USING ("evaluation"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("evaluation"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "pointage" AS PERMISSIVE FOR ALL TO public USING ("pointage"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("pointage"."entreprise_id" = current_setting('app.entreprise_id', true));
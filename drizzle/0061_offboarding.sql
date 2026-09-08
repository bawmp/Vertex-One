ALTER TABLE "dossier_rh" ADD COLUMN "date_depart" timestamp;--> statement-breakpoint

CREATE TYPE "public"."type_depart" AS ENUM('DEMISSION', 'LICENCIEMENT', 'FIN_CONTRAT', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."statut_depart" AS ENUM('EN_ATTENTE', 'APPROUVEE', 'REFUSEE', 'CLOTUREE');--> statement-breakpoint

CREATE TABLE "demande_depart" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"dossier_rh_id" text NOT NULL,
	"type" "type_depart" NOT NULL,
	"date_depart_souhaitee" timestamp NOT NULL,
	"motif" text,
	"statut" "statut_depart" DEFAULT 'EN_ATTENTE' NOT NULL,
	"date_depart_confirmee" timestamp,
	"entretien_sortie" text,
	"approuve_par_id" text,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demande_depart" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "clearance_depart" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"demande_depart_id" text NOT NULL,
	"libelle" text NOT NULL,
	"responsable_id" text NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	"complete_le" timestamp
);
--> statement-breakpoint
ALTER TABLE "clearance_depart" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "demande_depart" ADD CONSTRAINT "demande_depart_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demande_depart" ADD CONSTRAINT "demande_depart_dossier_rh_id_dossier_rh_id_fk" FOREIGN KEY ("dossier_rh_id") REFERENCES "public"."dossier_rh"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demande_depart" ADD CONSTRAINT "demande_depart_approuve_par_id_utilisateur_id_fk" FOREIGN KEY ("approuve_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demande_depart" ADD CONSTRAINT "demande_depart_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_depart" ADD CONSTRAINT "clearance_depart_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_depart" ADD CONSTRAINT "clearance_depart_demande_depart_id_demande_depart_id_fk" FOREIGN KEY ("demande_depart_id") REFERENCES "public"."demande_depart"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_depart" ADD CONSTRAINT "clearance_depart_responsable_id_utilisateur_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "demande_depart_entreprise_idx" ON "demande_depart" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "demande_depart_dossier_rh_idx" ON "demande_depart" USING btree ("dossier_rh_id");--> statement-breakpoint
CREATE INDEX "clearance_depart_entreprise_idx" ON "clearance_depart" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "clearance_depart_demande_idx" ON "clearance_depart" USING btree ("demande_depart_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "demande_depart" AS PERMISSIVE FOR ALL TO public USING ("demande_depart"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("demande_depart"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "clearance_depart" AS PERMISSIVE FOR ALL TO public USING ("clearance_depart"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("clearance_depart"."entreprise_id" = current_setting('app.entreprise_id', true));

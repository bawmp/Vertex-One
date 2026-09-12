CREATE TABLE "shift" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"heure_debut" time NOT NULL,
	"heure_fin" time NOT NULL,
	"tolerance_minutes" integer DEFAULT 0 NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shift" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "dossier_rh" ADD COLUMN "shift_id" text;--> statement-breakpoint

ALTER TABLE "shift" ADD CONSTRAINT "shift_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_rh" ADD CONSTRAINT "dossier_rh_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "shift_entreprise_idx" ON "shift" USING btree ("entreprise_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "shift" AS PERMISSIVE FOR ALL TO public USING ("shift"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("shift"."entreprise_id" = current_setting('app.entreprise_id', true));

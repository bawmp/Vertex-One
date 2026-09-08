CREATE TYPE "public"."type_politique_conge" AS ENUM('FIXE', 'ANCIENNETE');--> statement-breakpoint

CREATE TABLE "politique_conge" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"type" "type_politique_conge" NOT NULL,
	"jours_base_par_an" integer NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "politique_conge" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "politique_conge_palier" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"politique_conge_id" text NOT NULL,
	"annees_anciennete_min" integer NOT NULL,
	"jours_supplementaires" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "politique_conge_palier" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "dossier_rh" ADD COLUMN "politique_conge_id" text;--> statement-breakpoint

ALTER TABLE "politique_conge" ADD CONSTRAINT "politique_conge_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "politique_conge" ADD CONSTRAINT "politique_conge_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "politique_conge_palier" ADD CONSTRAINT "politique_conge_palier_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "politique_conge_palier" ADD CONSTRAINT "politique_conge_palier_politique_conge_id_politique_conge_id_fk" FOREIGN KEY ("politique_conge_id") REFERENCES "public"."politique_conge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_rh" ADD CONSTRAINT "dossier_rh_politique_conge_id_politique_conge_id_fk" FOREIGN KEY ("politique_conge_id") REFERENCES "public"."politique_conge"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "politique_conge_entreprise_idx" ON "politique_conge" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "politique_conge_palier_entreprise_idx" ON "politique_conge_palier" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "politique_conge_palier_politique_idx" ON "politique_conge_palier" USING btree ("politique_conge_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "politique_conge" AS PERMISSIVE FOR ALL TO public USING ("politique_conge"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("politique_conge"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "politique_conge_palier" AS PERMISSIVE FOR ALL TO public USING ("politique_conge_palier"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("politique_conge_palier"."entreprise_id" = current_setting('app.entreprise_id', true));

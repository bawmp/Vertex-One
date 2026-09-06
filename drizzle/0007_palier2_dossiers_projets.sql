CREATE TYPE "public"."statut_dossier" AS ENUM('ACTIF', 'ARCHIVE');--> statement-breakpoint
CREATE TYPE "public"."statut_projet" AS ENUM('A_FAIRE', 'EN_COURS', 'EN_REVISION', 'TERMINE', 'ANNULE');--> statement-breakpoint
CREATE TYPE "public"."statut_tache" AS ENUM('A_FAIRE', 'EN_COURS', 'TERMINEE');--> statement-breakpoint
CREATE TABLE "commentaire" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"dossier_id" text,
	"projet_id" text,
	"auteur_id" text NOT NULL,
	"contenu" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commentaire" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dossier" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"prospect_id" text NOT NULL,
	"titre" text NOT NULL,
	"statut" "statut_dossier" DEFAULT 'ACTIF' NOT NULL,
	"responsable_id" text NOT NULL,
	"date_ouverture" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dossier" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "projet" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"titre" text NOT NULL,
	"description" text,
	"statut" "statut_projet" DEFAULT 'A_FAIRE' NOT NULL,
	"devis_origine_id" text,
	"responsable_principal_id" text NOT NULL,
	"date_debut" timestamp,
	"date_echeance" timestamp,
	"champs_personnalises" json,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projet" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tache" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"projet_id" text NOT NULL,
	"titre" text NOT NULL,
	"statut" "statut_tache" DEFAULT 'A_FAIRE' NOT NULL,
	"assigne_a_id" text NOT NULL,
	"echeance" timestamp,
	"ordre" integer DEFAULT 0 NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"terminee_le" timestamp
);
--> statement-breakpoint
ALTER TABLE "tache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "commentaire" ADD CONSTRAINT "commentaire_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commentaire" ADD CONSTRAINT "commentaire_dossier_id_dossier_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commentaire" ADD CONSTRAINT "commentaire_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commentaire" ADD CONSTRAINT "commentaire_auteur_id_utilisateur_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier" ADD CONSTRAINT "dossier_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier" ADD CONSTRAINT "dossier_prospect_id_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospect"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier" ADD CONSTRAINT "dossier_responsable_id_utilisateur_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projet" ADD CONSTRAINT "projet_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projet" ADD CONSTRAINT "projet_dossier_id_dossier_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projet" ADD CONSTRAINT "projet_devis_origine_id_devis_id_fk" FOREIGN KEY ("devis_origine_id") REFERENCES "public"."devis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projet" ADD CONSTRAINT "projet_responsable_principal_id_utilisateur_id_fk" FOREIGN KEY ("responsable_principal_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tache" ADD CONSTRAINT "tache_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tache" ADD CONSTRAINT "tache_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tache" ADD CONSTRAINT "tache_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tache" ADD CONSTRAINT "tache_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commentaire_entreprise_idx" ON "commentaire" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "commentaire_dossier_idx" ON "commentaire" USING btree ("dossier_id");--> statement-breakpoint
CREATE INDEX "commentaire_projet_idx" ON "commentaire" USING btree ("projet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dossier_entreprise_prospect_unique" ON "dossier" USING btree ("entreprise_id","prospect_id");--> statement-breakpoint
CREATE INDEX "dossier_entreprise_idx" ON "dossier" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "dossier_responsable_idx" ON "dossier" USING btree ("responsable_id");--> statement-breakpoint
CREATE INDEX "projet_entreprise_idx" ON "projet" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "projet_dossier_idx" ON "projet" USING btree ("dossier_id");--> statement-breakpoint
CREATE INDEX "projet_responsable_idx" ON "projet" USING btree ("responsable_principal_id");--> statement-breakpoint
CREATE INDEX "tache_entreprise_idx" ON "tache" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "tache_projet_idx" ON "tache" USING btree ("projet_id");--> statement-breakpoint
CREATE INDEX "tache_assigne_idx" ON "tache" USING btree ("assigne_a_id");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "commentaire" AS PERMISSIVE FOR ALL TO public USING ("commentaire"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("commentaire"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "dossier" AS PERMISSIVE FOR ALL TO public USING ("dossier"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("dossier"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "projet" AS PERMISSIVE FOR ALL TO public USING ("projet"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("projet"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "tache" AS PERMISSIVE FOR ALL TO public USING ("tache"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("tache"."entreprise_id" = current_setting('app.entreprise_id', true));
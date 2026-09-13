CREATE TYPE "public"."statut_candidature" AS ENUM('RECUE', 'EN_EXAMEN', 'ENTRETIEN', 'OFFRE', 'EMBAUCHE', 'REJETEE');--> statement-breakpoint

CREATE TABLE "parametre_recrutement" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"slug" text NOT NULL,
	"titre" text DEFAULT 'Nos offres d''emploi' NOT NULL,
	"texte" text,
	"publie" boolean DEFAULT false NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parametre_recrutement_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "parametre_recrutement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "poste_ouvert" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"titre" text NOT NULL,
	"description" text,
	"lieu" text,
	"actif" boolean DEFAULT true NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "poste_ouvert" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "candidature" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"poste_id" text NOT NULL,
	"nom" text NOT NULL,
	"telephone" text NOT NULL,
	"email" text,
	"message" text,
	"cv_cle_stockage" text NOT NULL,
	"cv_nom_fichier" text NOT NULL,
	"cv_type_mime" text NOT NULL,
	"cv_taille_octets" integer NOT NULL,
	"statut" "statut_candidature" DEFAULT 'RECUE' NOT NULL,
	"assigne_a_id" text,
	"invitation_id" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidature" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "parametre_recrutement" ADD CONSTRAINT "parametre_recrutement_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poste_ouvert" ADD CONSTRAINT "poste_ouvert_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poste_ouvert" ADD CONSTRAINT "poste_ouvert_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidature" ADD CONSTRAINT "candidature_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidature" ADD CONSTRAINT "candidature_poste_id_poste_ouvert_id_fk" FOREIGN KEY ("poste_id") REFERENCES "public"."poste_ouvert"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidature" ADD CONSTRAINT "candidature_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidature" ADD CONSTRAINT "candidature_invitation_id_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "parametre_recrutement_entreprise_unique" ON "parametre_recrutement" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "parametre_recrutement_entreprise_idx" ON "parametre_recrutement" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "poste_ouvert_entreprise_idx" ON "poste_ouvert" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "candidature_entreprise_idx" ON "candidature" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "candidature_poste_idx" ON "candidature" USING btree ("poste_id");--> statement-breakpoint

CREATE POLICY "lecture_publique_ou_entreprise" ON "parametre_recrutement" AS PERMISSIVE FOR SELECT TO public USING ("parametre_recrutement"."entreprise_id" = current_setting('app.entreprise_id', true) OR ("parametre_recrutement"."publie" = true AND nullif(current_setting('app.entreprise_id', true), '') IS NULL));--> statement-breakpoint
CREATE POLICY "ecriture_entreprise" ON "parametre_recrutement" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("parametre_recrutement"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "modification_entreprise" ON "parametre_recrutement" AS PERMISSIVE FOR UPDATE TO public USING ("parametre_recrutement"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("parametre_recrutement"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "suppression_entreprise" ON "parametre_recrutement" AS PERMISSIVE FOR DELETE TO public USING ("parametre_recrutement"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "poste_ouvert" AS PERMISSIVE FOR ALL TO public USING ("poste_ouvert"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("poste_ouvert"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "candidature" AS PERMISSIVE FOR ALL TO public USING ("candidature"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("candidature"."entreprise_id" = current_setting('app.entreprise_id', true));

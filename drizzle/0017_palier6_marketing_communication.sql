CREATE TYPE "public"."canal_campagne" AS ENUM('EMAIL', 'WHATSAPP');--> statement-breakpoint
CREATE TYPE "public"."statut_campagne" AS ENUM('BROUILLON', 'ENVOYEE');--> statement-breakpoint
CREATE TABLE "addon_actif" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"addon" text NOT NULL,
	"prix_mensuel" integer NOT NULL,
	"active_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "addon_actif" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "campagne" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"canal" "canal_campagne" NOT NULL,
	"contenu" text NOT NULL,
	"segment" json NOT NULL,
	"statut" "statut_campagne" DEFAULT 'BROUILLON' NOT NULL,
	"envoyee_le" timestamp,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campagne" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "page_atterrissage" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"slug" text NOT NULL,
	"titre" text NOT NULL,
	"texte" text NOT NULL,
	"image_url" text,
	"texte_bouton" text DEFAULT 'Nous contacter' NOT NULL,
	"publiee" boolean DEFAULT false NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "page_atterrissage_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "page_atterrissage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "addon_actif" ADD CONSTRAINT "addon_actif_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campagne" ADD CONSTRAINT "campagne_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campagne" ADD CONSTRAINT "campagne_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_atterrissage" ADD CONSTRAINT "page_atterrissage_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addon_actif_entreprise_idx" ON "addon_actif" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "addon_actif_entreprise_addon_unique" ON "addon_actif" USING btree ("entreprise_id","addon");--> statement-breakpoint
CREATE INDEX "campagne_entreprise_idx" ON "campagne" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "page_atterrissage_entreprise_idx" ON "page_atterrissage" USING btree ("entreprise_id");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "addon_actif" AS PERMISSIVE FOR ALL TO public USING ("addon_actif"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("addon_actif"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "campagne" AS PERMISSIVE FOR ALL TO public USING ("campagne"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("campagne"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "lecture_publique_ou_entreprise" ON "page_atterrissage" AS PERMISSIVE FOR SELECT TO public USING ("page_atterrissage"."entreprise_id" = current_setting('app.entreprise_id', true) OR ("page_atterrissage"."publiee" = true AND nullif(current_setting('app.entreprise_id', true), '') IS NULL));--> statement-breakpoint
CREATE POLICY "ecriture_entreprise" ON "page_atterrissage" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("page_atterrissage"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "modification_entreprise" ON "page_atterrissage" AS PERMISSIVE FOR UPDATE TO public USING ("page_atterrissage"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("page_atterrissage"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "suppression_entreprise" ON "page_atterrissage" AS PERMISSIVE FOR DELETE TO public USING ("page_atterrissage"."entreprise_id" = current_setting('app.entreprise_id', true));
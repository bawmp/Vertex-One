CREATE TYPE "public"."statut_reservation" AS ENUM('CONFIRMEE', 'ANNULEE', 'TERMINEE', 'ABSENCE');--> statement-breakpoint
CREATE TYPE "public"."jour_semaine" AS ENUM('LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE');--> statement-breakpoint
ALTER TABLE "entreprise" ADD COLUMN "compteur_reservations" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

CREATE TABLE "parametre_reservation" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"slug" text NOT NULL,
	"titre" text DEFAULT 'Prendre rendez-vous' NOT NULL,
	"texte" text,
	"publie" boolean DEFAULT false NOT NULL,
	"delai_minimum_heures" integer DEFAULT 24 NOT NULL,
	"delai_maximum_jours" integer DEFAULT 60 NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parametre_reservation_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "parametre_reservation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "service_reservable" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"duree_minutes" integer NOT NULL,
	"duree_tampon_minutes" integer DEFAULT 0 NOT NULL,
	"prix_fcfa" integer DEFAULT 0 NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_reservable" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "intervenant_reservation" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"utilisateur_id" text NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intervenant_reservation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "disponibilite_reservation" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"intervenant_id" text NOT NULL,
	"jour_semaine" "jour_semaine" NOT NULL,
	"heure_debut" time NOT NULL,
	"heure_fin" time NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "disponibilite_reservation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "reservation" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"numero" text NOT NULL,
	"service_id" text NOT NULL,
	"intervenant_id" text NOT NULL,
	"date_debut" timestamp with time zone NOT NULL,
	"date_fin" timestamp with time zone NOT NULL,
	"duree_minutes_reservee" integer NOT NULL,
	"prix_fcfa_reserve" integer NOT NULL,
	"statut" "statut_reservation" DEFAULT 'CONFIRMEE' NOT NULL,
	"client_nom" text NOT NULL,
	"client_telephone" text NOT NULL,
	"client_email" text,
	"notes" text,
	"contact_id" text,
	"motif_annulation" text,
	"annulee_le" timestamp,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "parametre_reservation" ADD CONSTRAINT "parametre_reservation_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_reservable" ADD CONSTRAINT "service_reservable_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_reservable" ADD CONSTRAINT "service_reservable_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervenant_reservation" ADD CONSTRAINT "intervenant_reservation_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervenant_reservation" ADD CONSTRAINT "intervenant_reservation_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disponibilite_reservation" ADD CONSTRAINT "disponibilite_reservation_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disponibilite_reservation" ADD CONSTRAINT "disponibilite_reservation_intervenant_id_intervenant_reservation_id_fk" FOREIGN KEY ("intervenant_id") REFERENCES "public"."intervenant_reservation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_service_id_service_reservable_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service_reservable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_intervenant_id_intervenant_reservation_id_fk" FOREIGN KEY ("intervenant_id") REFERENCES "public"."intervenant_reservation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "parametre_reservation_entreprise_unique" ON "parametre_reservation" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "parametre_reservation_entreprise_idx" ON "parametre_reservation" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "service_reservable_entreprise_idx" ON "service_reservable" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "intervenant_reservation_utilisateur_unique" ON "intervenant_reservation" USING btree ("utilisateur_id");--> statement-breakpoint
CREATE INDEX "intervenant_reservation_entreprise_idx" ON "intervenant_reservation" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "disponibilite_reservation_intervenant_idx" ON "disponibilite_reservation" USING btree ("intervenant_id");--> statement-breakpoint
CREATE INDEX "disponibilite_reservation_entreprise_idx" ON "disponibilite_reservation" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_entreprise_numero_unique" ON "reservation" USING btree ("entreprise_id","numero");--> statement-breakpoint
CREATE INDEX "reservation_entreprise_idx" ON "reservation" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "reservation_intervenant_idx" ON "reservation" USING btree ("intervenant_id");--> statement-breakpoint

CREATE POLICY "lecture_publique_ou_entreprise" ON "parametre_reservation" AS PERMISSIVE FOR SELECT TO public USING ("parametre_reservation"."entreprise_id" = current_setting('app.entreprise_id', true) OR ("parametre_reservation"."publie" = true AND nullif(current_setting('app.entreprise_id', true), '') IS NULL));--> statement-breakpoint
CREATE POLICY "ecriture_entreprise" ON "parametre_reservation" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("parametre_reservation"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "modification_entreprise" ON "parametre_reservation" AS PERMISSIVE FOR UPDATE TO public USING ("parametre_reservation"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("parametre_reservation"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "suppression_entreprise" ON "parametre_reservation" AS PERMISSIVE FOR DELETE TO public USING ("parametre_reservation"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "service_reservable" AS PERMISSIVE FOR ALL TO public USING ("service_reservable"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("service_reservable"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "intervenant_reservation" AS PERMISSIVE FOR ALL TO public USING ("intervenant_reservation"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("intervenant_reservation"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "disponibilite_reservation" AS PERMISSIVE FOR ALL TO public USING ("disponibilite_reservation"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("disponibilite_reservation"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "reservation" AS PERMISSIVE FOR ALL TO public USING ("reservation"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("reservation"."entreprise_id" = current_setting('app.entreprise_id', true));

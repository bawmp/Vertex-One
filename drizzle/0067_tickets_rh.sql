CREATE TYPE "public"."statut_ticket_rh" AS ENUM('OUVERT', 'EN_COURS', 'RESOLU', 'FERME');--> statement-breakpoint

CREATE TABLE "categorie_ticket_rh" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"agent_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categorie_ticket_rh" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "ticket_rh" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"categorie_id" text NOT NULL,
	"demandeur_id" text NOT NULL,
	"titre" text NOT NULL,
	"description" text,
	"statut" "statut_ticket_rh" DEFAULT 'OUVERT' NOT NULL,
	"assigne_a_id" text,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"resolu_le" timestamp
);
--> statement-breakpoint
ALTER TABLE "ticket_rh" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "message_ticket_rh" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"auteur_id" text NOT NULL,
	"contenu" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message_ticket_rh" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "categorie_ticket_rh" ADD CONSTRAINT "categorie_ticket_rh_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorie_ticket_rh" ADD CONSTRAINT "categorie_ticket_rh_agent_id_utilisateur_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_rh" ADD CONSTRAINT "ticket_rh_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_rh" ADD CONSTRAINT "ticket_rh_categorie_id_categorie_ticket_rh_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categorie_ticket_rh"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_rh" ADD CONSTRAINT "ticket_rh_demandeur_id_utilisateur_id_fk" FOREIGN KEY ("demandeur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_rh" ADD CONSTRAINT "ticket_rh_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_ticket_rh" ADD CONSTRAINT "message_ticket_rh_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_ticket_rh" ADD CONSTRAINT "message_ticket_rh_ticket_id_ticket_rh_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket_rh"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_ticket_rh" ADD CONSTRAINT "message_ticket_rh_auteur_id_utilisateur_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "categorie_ticket_rh_entreprise_idx" ON "categorie_ticket_rh" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "ticket_rh_entreprise_idx" ON "ticket_rh" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "ticket_rh_categorie_idx" ON "ticket_rh" USING btree ("categorie_id");--> statement-breakpoint
CREATE INDEX "ticket_rh_demandeur_idx" ON "ticket_rh" USING btree ("demandeur_id");--> statement-breakpoint
CREATE INDEX "message_ticket_rh_entreprise_idx" ON "message_ticket_rh" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "message_ticket_rh_ticket_idx" ON "message_ticket_rh" USING btree ("ticket_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "categorie_ticket_rh" AS PERMISSIVE FOR ALL TO public USING ("categorie_ticket_rh"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("categorie_ticket_rh"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "ticket_rh" AS PERMISSIVE FOR ALL TO public USING ("ticket_rh"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("ticket_rh"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "message_ticket_rh" AS PERMISSIVE FOR ALL TO public USING ("message_ticket_rh"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("message_ticket_rh"."entreprise_id" = current_setting('app.entreprise_id', true));

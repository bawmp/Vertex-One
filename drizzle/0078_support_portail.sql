ALTER TABLE "invitation" ADD COLUMN "contact_id" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "utilisateur_id" text;--> statement-breakpoint

CREATE TYPE "public"."statut_ticket_support" AS ENUM('OUVERT', 'EN_COURS', 'RESOLU', 'FERME');--> statement-breakpoint

CREATE TABLE "categorie_ticket_support" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"agent_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categorie_ticket_support" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "ticket_support" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"categorie_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"titre" text NOT NULL,
	"description" text,
	"statut" "statut_ticket_support" DEFAULT 'OUVERT' NOT NULL,
	"assigne_a_id" text,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"resolu_le" timestamp
);
--> statement-breakpoint
ALTER TABLE "ticket_support" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "message_ticket_support" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"auteur_utilisateur_id" text,
	"auteur_contact_id" text,
	"contenu" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_ticket_support_un_seul_auteur" CHECK (num_nonnulls("auteur_utilisateur_id", "auteur_contact_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "message_ticket_support" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "invitation" ADD CONSTRAINT "invitation_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorie_ticket_support" ADD CONSTRAINT "categorie_ticket_support_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorie_ticket_support" ADD CONSTRAINT "categorie_ticket_support_agent_id_utilisateur_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_support" ADD CONSTRAINT "ticket_support_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_support" ADD CONSTRAINT "ticket_support_categorie_id_categorie_ticket_support_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categorie_ticket_support"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_support" ADD CONSTRAINT "ticket_support_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_support" ADD CONSTRAINT "ticket_support_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_ticket_support" ADD CONSTRAINT "message_ticket_support_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_ticket_support" ADD CONSTRAINT "message_ticket_support_ticket_id_ticket_support_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket_support"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_ticket_support" ADD CONSTRAINT "message_ticket_support_auteur_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("auteur_utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_ticket_support" ADD CONSTRAINT "message_ticket_support_auteur_contact_id_contact_id_fk" FOREIGN KEY ("auteur_contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "contact_utilisateur_id_unique" ON "contact" USING btree ("utilisateur_id");--> statement-breakpoint
CREATE INDEX "categorie_ticket_support_entreprise_idx" ON "categorie_ticket_support" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "ticket_support_entreprise_idx" ON "ticket_support" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "ticket_support_categorie_idx" ON "ticket_support" USING btree ("categorie_id");--> statement-breakpoint
CREATE INDEX "ticket_support_contact_idx" ON "ticket_support" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "message_ticket_support_entreprise_idx" ON "message_ticket_support" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "message_ticket_support_ticket_idx" ON "message_ticket_support" USING btree ("ticket_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "categorie_ticket_support" AS PERMISSIVE FOR ALL TO public USING ("categorie_ticket_support"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("categorie_ticket_support"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "ticket_support" AS PERMISSIVE FOR ALL TO public USING ("ticket_support"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("ticket_support"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "message_ticket_support" AS PERMISSIVE FOR ALL TO public USING ("message_ticket_support"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("message_ticket_support"."entreprise_id" = current_setting('app.entreprise_id', true));

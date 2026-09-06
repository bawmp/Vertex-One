CREATE TYPE "public"."statut_tache_crm" AS ENUM('NON_COMMENCEE', 'EN_COURS', 'TERMINEE', 'DIFFEREE');--> statement-breakpoint
CREATE TYPE "public"."priorite_tache_crm" AS ENUM('BASSE', 'NORMALE', 'HAUTE');--> statement-breakpoint

CREATE TABLE "tache_crm" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"objet" text NOT NULL,
	"statut" "statut_tache_crm" DEFAULT 'NON_COMMENCEE' NOT NULL,
	"priorite" "priorite_tache_crm" DEFAULT 'NORMALE' NOT NULL,
	"date_echeance" timestamp,
	"lead_id" text,
	"contact_id" text,
	"deal_id" text,
	"assigne_a_id" text NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"terminee_le" timestamp
);
--> statement-breakpoint
ALTER TABLE "tache_crm" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "reunion_crm" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"titre" text NOT NULL,
	"date_debut" timestamp NOT NULL,
	"date_fin" timestamp NOT NULL,
	"lead_id" text,
	"contact_id" text,
	"deal_id" text,
	"assigne_a_id" text NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reunion_crm" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "tache_crm" ADD CONSTRAINT "tache_crm_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tache_crm" ADD CONSTRAINT "tache_crm_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tache_crm" ADD CONSTRAINT "tache_crm_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tache_crm" ADD CONSTRAINT "tache_crm_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tache_crm" ADD CONSTRAINT "tache_crm_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tache_crm" ADD CONSTRAINT "tache_crm_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "reunion_crm" ADD CONSTRAINT "reunion_crm_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reunion_crm" ADD CONSTRAINT "reunion_crm_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reunion_crm" ADD CONSTRAINT "reunion_crm_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reunion_crm" ADD CONSTRAINT "reunion_crm_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reunion_crm" ADD CONSTRAINT "reunion_crm_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reunion_crm" ADD CONSTRAINT "reunion_crm_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "tache_crm_entreprise_idx" ON "tache_crm" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "tache_crm_assigne_idx" ON "tache_crm" USING btree ("assigne_a_id");--> statement-breakpoint
CREATE INDEX "tache_crm_lead_idx" ON "tache_crm" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "tache_crm_contact_idx" ON "tache_crm" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "tache_crm_deal_idx" ON "tache_crm" USING btree ("deal_id");--> statement-breakpoint

CREATE INDEX "reunion_crm_entreprise_idx" ON "reunion_crm" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "reunion_crm_assigne_idx" ON "reunion_crm" USING btree ("assigne_a_id");--> statement-breakpoint
CREATE INDEX "reunion_crm_lead_idx" ON "reunion_crm" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "reunion_crm_contact_idx" ON "reunion_crm" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "reunion_crm_deal_idx" ON "reunion_crm" USING btree ("deal_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "tache_crm" AS PERMISSIVE FOR ALL TO public USING ("tache_crm"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("tache_crm"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "reunion_crm" AS PERMISSIVE FOR ALL TO public USING ("reunion_crm"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("reunion_crm"."entreprise_id" = current_setting('app.entreprise_id', true));

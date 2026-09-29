-- Contacts supplémentaires d'un Deal (2026-09-29) : deal.contactId reste le contact principal, inchangé — cette
-- nouvelle table (RLS + FORCE) ajoute seulement des contacts secondaires. Rejouable sans erreur.
CREATE TABLE IF NOT EXISTS "deal_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"deal_id" text NOT NULL,
	"contact_id" text NOT NULL
);--> statement-breakpoint
ALTER TABLE "deal_contact" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deal_contact" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deal_contact" ADD CONSTRAINT "deal_contact_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_contact" ADD CONSTRAINT "deal_contact_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_contact" ADD CONSTRAINT "deal_contact_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deal_contact_entreprise_idx" ON "deal_contact" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deal_contact_deal_idx" ON "deal_contact" USING btree ("deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "deal_contact_deal_contact_unique" ON "deal_contact" USING btree ("deal_id","contact_id");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "deal_contact" AS PERMISSIVE FOR ALL TO public USING ("deal_contact"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("deal_contact"."entreprise_id" = current_setting('app.entreprise_id', true));

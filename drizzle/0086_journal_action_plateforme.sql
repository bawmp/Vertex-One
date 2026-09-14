CREATE TABLE "journal_action_plateforme" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"staff_email" text NOT NULL,
	"action" text NOT NULL,
	"details" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journal_action_plateforme" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "journal_action_plateforme" ADD CONSTRAINT "journal_action_plateforme_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_action_plateforme_entreprise_idx" ON "journal_action_plateforme" USING btree ("entreprise_id");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "journal_action_plateforme" AS PERMISSIVE FOR ALL TO public USING ("journal_action_plateforme"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("journal_action_plateforme"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
ALTER TABLE "journal_action_plateforme" FORCE ROW LEVEL SECURITY;

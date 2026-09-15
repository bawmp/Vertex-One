-- Custom SQL migration file, put your code below! --
CREATE TABLE "service" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_entreprise_idx" ON "service" USING btree ("entreprise_id");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "service" AS PERMISSIVE FOR ALL TO public USING ("service"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("service"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
ALTER TABLE "service" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "utilisateur" ADD COLUMN "service_id" text;--> statement-breakpoint
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "utilisateur_manager_idx" ON "utilisateur" USING btree ("manager_id");--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "manager_propose" text;

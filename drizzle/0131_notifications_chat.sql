CREATE TABLE IF NOT EXISTS "abonnement_push" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"utilisateur_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"cle_p256dh" text NOT NULL,
	"cle_auth" text NOT NULL,
	"agent" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "abonnement_push" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "abonnement_push" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "abonnement_push" ADD CONSTRAINT "abonnement_push_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "abonnement_push" ADD CONSTRAINT "abonnement_push_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "abonnement_push_entreprise_idx" ON "abonnement_push" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "abonnement_push_utilisateur_idx" ON "abonnement_push" USING btree ("utilisateur_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "abonnement_push_endpoint_unique" ON "abonnement_push" USING btree ("entreprise_id","endpoint");--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise" ON "abonnement_push";--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "abonnement_push" AS PERMISSIVE FOR ALL TO public USING ("abonnement_push"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("abonnement_push"."entreprise_id" = current_setting('app.entreprise_id', true))--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "preference_notification" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"utilisateur_id" text NOT NULL,
	"niveau" text DEFAULT 'PRIVE_MENTIONS' NOT NULL,
	"son" boolean DEFAULT true NOT NULL,
	"apercu" boolean DEFAULT true NOT NULL,
	"mis_a_jour_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "preference_notification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "preference_notification" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "preference_notification" ADD CONSTRAINT "preference_notification_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "preference_notification" ADD CONSTRAINT "preference_notification_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "preference_notification_entreprise_idx" ON "preference_notification" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "preference_notification_utilisateur_unique" ON "preference_notification" USING btree ("utilisateur_id");--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise" ON "preference_notification";--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "preference_notification" AS PERMISSIVE FOR ALL TO public USING ("preference_notification"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("preference_notification"."entreprise_id" = current_setting('app.entreprise_id', true))--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canal_sourdine" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"utilisateur_id" text NOT NULL,
	"canal_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "canal_sourdine" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "canal_sourdine" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "canal_sourdine" ADD CONSTRAINT "canal_sourdine_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "canal_sourdine" ADD CONSTRAINT "canal_sourdine_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "canal_sourdine" ADD CONSTRAINT "canal_sourdine_canal_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."canal"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canal_sourdine_entreprise_idx" ON "canal_sourdine" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canal_sourdine_utilisateur_canal_unique" ON "canal_sourdine" USING btree ("utilisateur_id","canal_id");--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_entreprise" ON "canal_sourdine";--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "canal_sourdine" AS PERMISSIVE FOR ALL TO public USING ("canal_sourdine"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("canal_sourdine"."entreprise_id" = current_setting('app.entreprise_id', true))

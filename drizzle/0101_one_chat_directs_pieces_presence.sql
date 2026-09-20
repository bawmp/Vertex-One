-- One Chat : messages directs, pièces jointes, notifications, présence (2026-09-20).
-- Une valeur d'enum, une table (RLS + FORCE) et des colonnes nullables. Rejouable sans erreur.
ALTER TYPE "type_canal" ADD VALUE IF NOT EXISTS 'DIRECT';--> statement-breakpoint
ALTER TABLE "message_canal" ADD COLUMN IF NOT EXISTS "piece_jointe_cle" text;--> statement-breakpoint
ALTER TABLE "message_canal" ADD COLUMN IF NOT EXISTS "piece_jointe_nom" text;--> statement-breakpoint
ALTER TABLE "message_canal" ADD COLUMN IF NOT EXISTS "piece_jointe_type" text;--> statement-breakpoint
ALTER TABLE "message_canal" ADD COLUMN IF NOT EXISTS "piece_jointe_taille" integer;--> statement-breakpoint
ALTER TABLE "message_canal" ADD COLUMN IF NOT EXISTS "notifie_le" timestamp;--> statement-breakpoint
ALTER TABLE "utilisateur" ADD COLUMN IF NOT EXISTS "derniere_activite_le" timestamp;--> statement-breakpoint
ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "messages_a_notifier_depuis" timestamp;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "membre_canal" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"canal_id" text NOT NULL,
	"utilisateur_id" text NOT NULL
);--> statement-breakpoint
ALTER TABLE "membre_canal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "membre_canal" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "membre_canal" ADD CONSTRAINT "membre_canal_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membre_canal" ADD CONSTRAINT "membre_canal_canal_id_canal_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."canal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membre_canal" ADD CONSTRAINT "membre_canal_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "membre_canal_entreprise_idx" ON "membre_canal" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "membre_canal_utilisateur_idx" ON "membre_canal" USING btree ("utilisateur_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "membre_canal_canal_utilisateur_unique" ON "membre_canal" USING btree ("canal_id","utilisateur_id");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "membre_canal" AS PERMISSIVE FOR ALL TO public USING ("membre_canal"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("membre_canal"."entreprise_id" = current_setting('app.entreprise_id', true));

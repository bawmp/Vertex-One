-- One Chat : groupes privés, réactions, fils de discussion, mentions (2026-09-20).
-- Une valeur d'enum, deux tables (RLS + FORCE) et des colonnes nullables. Rejouable sans erreur.
ALTER TYPE "type_canal" ADD VALUE IF NOT EXISTS 'PRIVE';--> statement-breakpoint
ALTER TABLE "canal" ADD COLUMN IF NOT EXISTS "cree_par_id" text;--> statement-breakpoint
ALTER TABLE "message_canal" ADD COLUMN IF NOT EXISTS "parent_id" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reaction_message" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"message_id" text NOT NULL,
	"utilisateur_id" text NOT NULL,
	"emoji" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "reaction_message" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reaction_message" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mention_message" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"message_id" text NOT NULL,
	"utilisateur_id" text NOT NULL,
	"notifie_le" timestamp
);--> statement-breakpoint
ALTER TABLE "mention_message" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mention_message" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "canal" ADD CONSTRAINT "canal_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_canal" ADD CONSTRAINT "message_canal_parent_id_message_canal_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."message_canal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reaction_message" ADD CONSTRAINT "reaction_message_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reaction_message" ADD CONSTRAINT "reaction_message_message_id_message_canal_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message_canal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reaction_message" ADD CONSTRAINT "reaction_message_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention_message" ADD CONSTRAINT "mention_message_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention_message" ADD CONSTRAINT "mention_message_message_id_message_canal_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message_canal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention_message" ADD CONSTRAINT "mention_message_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_canal_parent_idx" ON "message_canal" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reaction_message_entreprise_idx" ON "reaction_message" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reaction_message_message_idx" ON "reaction_message" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reaction_message_unique" ON "reaction_message" USING btree ("message_id","utilisateur_id","emoji");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mention_message_entreprise_idx" ON "mention_message" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mention_message_utilisateur_idx" ON "mention_message" USING btree ("utilisateur_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mention_message_unique" ON "mention_message" USING btree ("message_id","utilisateur_id");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "reaction_message" AS PERMISSIVE FOR ALL TO public USING ("reaction_message"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("reaction_message"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "mention_message" AS PERMISSIVE FOR ALL TO public USING ("mention_message"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("mention_message"."entreprise_id" = current_setting('app.entreprise_id', true));

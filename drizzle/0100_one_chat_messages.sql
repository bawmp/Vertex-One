-- One Chat intégré (2026-09-20) : messages et suivi de lecture des canaux. Deux nouvelles
-- tables, RLS standard (isolation par entreprise) avec FORCE. Rejouable sans erreur.
CREATE TABLE IF NOT EXISTS "message_canal" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"canal_id" text NOT NULL,
	"auteur_id" text NOT NULL,
	"contenu" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"mis_a_jour_le" timestamp DEFAULT now() NOT NULL,
	"supprime_le" timestamp
);--> statement-breakpoint
ALTER TABLE "message_canal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message_canal" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message_canal" ADD CONSTRAINT "message_canal_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_canal" ADD CONSTRAINT "message_canal_canal_id_canal_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."canal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_canal" ADD CONSTRAINT "message_canal_auteur_id_utilisateur_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_canal_entreprise_idx" ON "message_canal" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_canal_canal_cree_idx" ON "message_canal" USING btree ("canal_id","cree_le");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_canal_canal_maj_idx" ON "message_canal" USING btree ("canal_id","mis_a_jour_le");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "message_canal" AS PERMISSIVE FOR ALL TO public USING ("message_canal"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("message_canal"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lecture_canal" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"canal_id" text NOT NULL,
	"utilisateur_id" text NOT NULL,
	"derniere_lecture_le" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "lecture_canal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lecture_canal" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lecture_canal" ADD CONSTRAINT "lecture_canal_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lecture_canal" ADD CONSTRAINT "lecture_canal_canal_id_canal_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."canal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lecture_canal" ADD CONSTRAINT "lecture_canal_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lecture_canal_entreprise_idx" ON "lecture_canal" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lecture_canal_canal_utilisateur_unique" ON "lecture_canal" USING btree ("canal_id","utilisateur_id");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "lecture_canal" AS PERMISSIVE FOR ALL TO public USING ("lecture_canal"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("lecture_canal"."entreprise_id" = current_setting('app.entreprise_id', true));

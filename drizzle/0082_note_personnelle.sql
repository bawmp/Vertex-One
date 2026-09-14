CREATE TABLE "note_personnelle" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"utilisateur_id" text NOT NULL,
	"contenu" text DEFAULT '' NOT NULL,
	"mis_a_jour_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note_personnelle" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "note_personnelle" ADD CONSTRAINT "note_personnelle_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_personnelle" ADD CONSTRAINT "note_personnelle_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "note_personnelle_utilisateur_unique" ON "note_personnelle" USING btree ("utilisateur_id");--> statement-breakpoint
CREATE INDEX "note_personnelle_entreprise_idx" ON "note_personnelle" USING btree ("entreprise_id");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "note_personnelle" AS PERMISSIVE FOR ALL TO public USING ("note_personnelle"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("note_personnelle"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
ALTER TABLE "note_personnelle" FORCE ROW LEVEL SECURITY;

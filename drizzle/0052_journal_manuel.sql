ALTER TABLE "entreprise" ADD COLUMN "compteur_journaux_manuels" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ecriture_comptable" ADD COLUMN "journal_manuel_id" text;--> statement-breakpoint

CREATE TABLE "journal_manuel" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"numero" text NOT NULL,
	"libelle" text NOT NULL,
	"date_ecriture" timestamp NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journal_manuel" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "journal_manuel" ADD CONSTRAINT "journal_manuel_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_manuel" ADD CONSTRAINT "journal_manuel_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "journal_manuel_entreprise_numero_unique" ON "journal_manuel" USING btree ("entreprise_id","numero");--> statement-breakpoint
CREATE INDEX "journal_manuel_entreprise_idx" ON "journal_manuel" USING btree ("entreprise_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "journal_manuel" AS PERMISSIVE FOR ALL TO public USING ("journal_manuel"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("journal_manuel"."entreprise_id" = current_setting('app.entreprise_id', true));

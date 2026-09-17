CREATE TABLE "secret_vault" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"titre" text NOT NULL,
	"identifiant" text,
	"url" text,
	"contenu_chiffre" text NOT NULL,
	"partage" boolean DEFAULT false NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"mis_a_jour_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_acces_secret_vault" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"secret_id" text NOT NULL,
	"utilisateur_id" text NOT NULL,
	"action" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "secret_vault" ADD CONSTRAINT "secret_vault_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "secret_vault" ADD CONSTRAINT "secret_vault_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "journal_acces_secret_vault" ADD CONSTRAINT "journal_acces_secret_vault_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "journal_acces_secret_vault" ADD CONSTRAINT "journal_acces_secret_vault_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "secret_vault_entreprise_idx" ON "secret_vault" USING btree ("entreprise_id");
--> statement-breakpoint
CREATE INDEX "journal_acces_secret_vault_entreprise_idx" ON "journal_acces_secret_vault" USING btree ("entreprise_id");
--> statement-breakpoint
CREATE INDEX "journal_acces_secret_vault_secret_idx" ON "journal_acces_secret_vault" USING btree ("secret_id");
--> statement-breakpoint
ALTER TABLE "secret_vault" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "journal_acces_secret_vault" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "secret_vault" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "journal_acces_secret_vault" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "secret_vault" AS PERMISSIVE FOR ALL TO public USING ("secret_vault"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("secret_vault"."entreprise_id" = current_setting('app.entreprise_id', true));
--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "journal_acces_secret_vault" AS PERMISSIVE FOR ALL TO public USING ("journal_acces_secret_vault"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("journal_acces_secret_vault"."entreprise_id" = current_setting('app.entreprise_id', true));

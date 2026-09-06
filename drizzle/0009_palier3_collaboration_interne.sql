CREATE TYPE "public"."categorie_document" AS ENUM('GENERAL', 'PIECE_IDENTITE', 'DONNEES_SANTE', 'AUTRE_SENSIBLE');--> statement-breakpoint
CREATE TYPE "public"."type_canal" AS ENUM('PROJET', 'EQUIPE', 'LIBRE');--> statement-breakpoint
CREATE TABLE "annonce" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"auteur_id" text NOT NULL,
	"contenu" text NOT NULL,
	"epinglee" boolean DEFAULT false NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "annonce" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "canal" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"type" "type_canal" NOT NULL,
	"projet_id" text,
	"id_fournisseur_chat" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "canal_id_fournisseur_chat_unique" UNIQUE("id_fournisseur_chat")
);
--> statement-breakpoint
ALTER TABLE "canal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"dossier_id" text,
	"projet_id" text,
	"categorie" "categorie_document" DEFAULT 'GENERAL' NOT NULL,
	"nom" text NOT NULL,
	"cle_stockage" text NOT NULL,
	"type_mime" text NOT NULL,
	"taille_octets" integer NOT NULL,
	"televerse_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journal_acces_document" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"document_id" text NOT NULL,
	"utilisateur_id" text NOT NULL,
	"action" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journal_acces_document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dossier" ADD COLUMN "consentement_donnees_le" timestamp;--> statement-breakpoint
ALTER TABLE "annonce" ADD CONSTRAINT "annonce_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annonce" ADD CONSTRAINT "annonce_auteur_id_utilisateur_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canal" ADD CONSTRAINT "canal_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canal" ADD CONSTRAINT "canal_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_dossier_id_dossier_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_televerse_par_id_utilisateur_id_fk" FOREIGN KEY ("televerse_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_acces_document" ADD CONSTRAINT "journal_acces_document_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_acces_document" ADD CONSTRAINT "journal_acces_document_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annonce_entreprise_idx" ON "annonce" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "canal_entreprise_idx" ON "canal" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "canal_projet_idx" ON "canal" USING btree ("projet_id");--> statement-breakpoint
CREATE INDEX "document_entreprise_idx" ON "document" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "document_dossier_idx" ON "document" USING btree ("dossier_id");--> statement-breakpoint
CREATE INDEX "document_projet_idx" ON "document" USING btree ("projet_id");--> statement-breakpoint
CREATE INDEX "journal_acces_document_entreprise_idx" ON "journal_acces_document" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "journal_acces_document_document_idx" ON "journal_acces_document" USING btree ("document_id");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "annonce" AS PERMISSIVE FOR ALL TO public USING ("annonce"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("annonce"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "canal" AS PERMISSIVE FOR ALL TO public USING ("canal"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("canal"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "document" AS PERMISSIVE FOR ALL TO public USING ("document"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("document"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "journal_acces_document" AS PERMISSIVE FOR ALL TO public USING ("journal_acces_document"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("journal_acces_document"."entreprise_id" = current_setting('app.entreprise_id', true));
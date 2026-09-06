CREATE TYPE "public"."statut_contrat" AS ENUM('ACTIF', 'EXPIRE', 'RESILIE');--> statement-breakpoint
CREATE TYPE "public"."statut_signature" AS ENUM('EN_ATTENTE', 'SIGNE', 'REFUSE', 'EXPIRE');--> statement-breakpoint
CREATE TYPE "public"."type_signature" AS ENUM('SIMPLE', 'CERTIFIEE');--> statement-breakpoint
CREATE TABLE "compte_comptable" (
	"id" text PRIMARY KEY NOT NULL,
	"numero" text NOT NULL,
	"libelle" text NOT NULL,
	"classe" integer NOT NULL,
	CONSTRAINT "compte_comptable_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "contrat" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"demande_signature_id" text,
	"titre" text NOT NULL,
	"date_debut" timestamp NOT NULL,
	"date_fin" timestamp,
	"renouvellement_auto" boolean DEFAULT false NOT NULL,
	"preavis_jours" integer DEFAULT 30 NOT NULL,
	"statut" "statut_contrat" DEFAULT 'ACTIF' NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contrat" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "demande_signature" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"document_id" text NOT NULL,
	"type" "type_signature" DEFAULT 'SIMPLE' NOT NULL,
	"statut" "statut_signature" DEFAULT 'EN_ATTENTE' NOT NULL,
	"empreinte_document" text NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demande_signature" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ecriture_comptable" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"date_ecriture" timestamp NOT NULL,
	"libelle" text NOT NULL,
	"compte_id" text NOT NULL,
	"debit" integer DEFAULT 0 NOT NULL,
	"credit" integer DEFAULT 0 NOT NULL,
	"facture_id" text,
	"paiement_id" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ecriture_comptable" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "signataire" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"demande_signature_id" text NOT NULL,
	"nom" text NOT NULL,
	"telephone" text NOT NULL,
	"email" text,
	"statut" "statut_signature" DEFAULT 'EN_ATTENTE' NOT NULL,
	"code_verification_envoye" boolean DEFAULT false NOT NULL,
	"code_verification_hash" text,
	"signe_le" timestamp,
	"adresse_ip" text,
	"navigateur_utilisateur" text,
	"consentement_explicite" boolean DEFAULT false NOT NULL,
	"jeton_acces" text NOT NULL,
	"reference_certificat_antic" text,
	CONSTRAINT "signataire_jeton_acces_unique" UNIQUE("jeton_acces")
);
--> statement-breakpoint
ALTER TABLE "signataire" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contrat" ADD CONSTRAINT "contrat_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrat" ADD CONSTRAINT "contrat_dossier_id_dossier_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrat" ADD CONSTRAINT "contrat_demande_signature_id_demande_signature_id_fk" FOREIGN KEY ("demande_signature_id") REFERENCES "public"."demande_signature"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demande_signature" ADD CONSTRAINT "demande_signature_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demande_signature" ADD CONSTRAINT "demande_signature_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demande_signature" ADD CONSTRAINT "demande_signature_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecriture_comptable" ADD CONSTRAINT "ecriture_comptable_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecriture_comptable" ADD CONSTRAINT "ecriture_comptable_compte_id_compte_comptable_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."compte_comptable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signataire" ADD CONSTRAINT "signataire_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signataire" ADD CONSTRAINT "signataire_demande_signature_id_demande_signature_id_fk" FOREIGN KEY ("demande_signature_id") REFERENCES "public"."demande_signature"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contrat_entreprise_idx" ON "contrat" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "contrat_dossier_idx" ON "contrat" USING btree ("dossier_id");--> statement-breakpoint
CREATE INDEX "demande_signature_entreprise_idx" ON "demande_signature" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "demande_signature_document_idx" ON "demande_signature" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "ecriture_comptable_entreprise_idx" ON "ecriture_comptable" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "ecriture_comptable_compte_idx" ON "ecriture_comptable" USING btree ("compte_id");--> statement-breakpoint
CREATE INDEX "signataire_entreprise_idx" ON "signataire" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "signataire_demande_idx" ON "signataire" USING btree ("demande_signature_id");--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "contrat" AS PERMISSIVE FOR ALL TO public USING ("contrat"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("contrat"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "demande_signature" AS PERMISSIVE FOR ALL TO public USING ("demande_signature"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("demande_signature"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "ecriture_comptable" AS PERMISSIVE FOR ALL TO public USING ("ecriture_comptable"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("ecriture_comptable"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise_lecture" ON "signataire" AS PERMISSIVE FOR SELECT TO public USING ("signataire"."entreprise_id" = current_setting('app.entreprise_id', true) OR nullif(current_setting('app.entreprise_id', true), '') IS NULL);--> statement-breakpoint
CREATE POLICY "isolation_entreprise_ecriture" ON "signataire" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("signataire"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise_modification" ON "signataire" AS PERMISSIVE FOR UPDATE TO public USING ("signataire"."entreprise_id" = current_setting('app.entreprise_id', true) OR nullif(current_setting('app.entreprise_id', true), '') IS NULL) WITH CHECK ("signataire"."entreprise_id" = current_setting('app.entreprise_id', true) OR nullif(current_setting('app.entreprise_id', true), '') IS NULL);--> statement-breakpoint
CREATE POLICY "isolation_entreprise_suppression" ON "signataire" AS PERMISSIVE FOR DELETE TO public USING ("signataire"."entreprise_id" = current_setting('app.entreprise_id', true));
CREATE TYPE "public"."role_systeme" AS ENUM('ADMIN', 'MANAGER', 'EMPLOYE', 'CLIENT');--> statement-breakpoint
CREATE TYPE "public"."statut_domaine_email" AS ENUM('SOUS_DOMAINE_VERTEX', 'EN_ATTENTE_DNS', 'VERIFIE');--> statement-breakpoint
CREATE TYPE "public"."statut_utilisateur" AS ENUM('ACTIF', 'INVITE', 'DESACTIVE');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"provider_id" text NOT NULL,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text
);
--> statement-breakpoint
CREATE TABLE "domaine_email" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"domaine" text NOT NULL,
	"statut" "statut_domaine_email" DEFAULT 'SOUS_DOMAINE_VERTEX' NOT NULL,
	"enregistrements_dns" json,
	"verifie_le" timestamp,
	CONSTRAINT "domaine_email_domaine_unique" UNIQUE("domaine")
);
--> statement-breakpoint
CREATE TABLE "entreprise" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"secteur_profil" text NOT NULL,
	"plan_abonnement" text DEFAULT 'starter' NOT NULL,
	"statut_abonnement" text DEFAULT 'essai' NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"email" text NOT NULL,
	"role_proposee" "role_systeme" NOT NULL,
	"poste_propose" text,
	"type_contrat_propose" text,
	"date_embauche_propose" timestamp,
	"jeton" text NOT NULL,
	"expire_le" timestamp NOT NULL,
	"utilisee_le" timestamp,
	CONSTRAINT "invitation_jeton_unique" UNIQUE("jeton")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "utilisateur" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"email" text NOT NULL,
	"nom_complet" text NOT NULL,
	"email_verifie" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "role_systeme" DEFAULT 'EMPLOYE' NOT NULL,
	"statut" "statut_utilisateur" DEFAULT 'ACTIF' NOT NULL,
	"manager_id" text,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	"mis_a_jour_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_utilisateur_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domaine_email" ADD CONSTRAINT "domaine_email_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_utilisateur_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "domaine_email_entreprise_idx" ON "domaine_email" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "invitation_entreprise_idx" ON "invitation" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "utilisateur_entreprise_email_unique" ON "utilisateur" USING btree ("entreprise_id","email");--> statement-breakpoint
CREATE INDEX "utilisateur_entreprise_idx" ON "utilisateur" USING btree ("entreprise_id");
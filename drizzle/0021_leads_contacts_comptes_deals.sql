-- Reconstruction Leads/Contacts/Comptes/Deals (échange du 2026-09-06),
-- remplaçant l'entité unique Prospect par le modèle à quatre entités de
-- Zoho CRM. Migration écrite à la main (drizzle-kit generate exige un
-- terminal interactif indisponible dans cet environnement) — voir CLAUDE.md
-- pour le contexte de la décision produit.
--
-- Aucune donnée client réelle n'existe encore (confirmé par l'utilisateur,
-- 2026-09-06) : impossible de remapper mécaniquement un Prospect vers
-- Contact+Compte+Deal (la conversion dépend d'une décision métier — société
-- ou non — pas d'une règle automatique), donc on repart de zéro sur tout le
-- graphe commercial plutôt que de bricoler une migration de données
-- fictives. TRUNCATE ... CASCADE couvre tout ce qui pend de Prospect :
-- dossier → projet → tache/commentaire/canal, dossier → document →
-- demande_signature → signataire, dossier → contrat, devis/facture →
-- ligne_devis/ligne_facture/paiement/avoir_facture, interaction.
-- journal_acces_document n'a pas de contrainte FK réelle vers document
-- (voir schema.ts, choix délibéré pour survivre à l'effacement RGPD d'un
-- document) : ses lignes ne sont pas cascadées, orphelines sans
-- conséquence pour un simple nettoyage de données de test.
TRUNCATE TABLE "prospect" CASCADE;--> statement-breakpoint

CREATE TYPE "public"."statut_lead" AS ENUM('NOUVEAU', 'CONTACTE', 'QUALIFIE', 'DISQUALIFIE');--> statement-breakpoint
CREATE TYPE "public"."statut_deal" AS ENUM('QUALIFICATION', 'PROPOSITION', 'NEGOCIATION', 'GAGNE', 'PERDU');--> statement-breakpoint

CREATE TABLE "lead" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"societe_cliente" text,
	"telephone" text NOT NULL,
	"email" text,
	"statut" "statut_lead" DEFAULT 'NOUVEAU' NOT NULL,
	"notes" text,
	"assigne_a_id" text NOT NULL,
	"converti_le" timestamp,
	"contact_converti_id" text,
	"deal_converti_id" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "compte_client" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"niu" text,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compte_client" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "contact" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"compte_id" text,
	"nom" text NOT NULL,
	"telephone" text NOT NULL,
	"email" text,
	"fonction" text,
	"notes" text,
	"assigne_a_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "deal" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"titre" text NOT NULL,
	"montant" integer DEFAULT 0 NOT NULL,
	"contact_id" text NOT NULL,
	"compte_id" text,
	"statut" "statut_deal" DEFAULT 'QUALIFICATION' NOT NULL,
	"date_cloture_estimee" timestamp,
	"assigne_a_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "historique_statut_deal" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"deal_id" text NOT NULL,
	"ancien_statut" "statut_deal",
	"nouveau_statut" "statut_deal" NOT NULL,
	"modifie_par_id" text NOT NULL,
	"modifie_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "historique_statut_deal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "lead" ADD CONSTRAINT "lead_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compte_client" ADD CONSTRAINT "compte_client_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_compte_id_compte_client_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."compte_client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_compte_id_compte_client_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."compte_client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_statut_deal" ADD CONSTRAINT "historique_statut_deal_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_statut_deal" ADD CONSTRAINT "historique_statut_deal_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historique_statut_deal" ADD CONSTRAINT "historique_statut_deal_modifie_par_id_utilisateur_id_fk" FOREIGN KEY ("modifie_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "lead_entreprise_idx" ON "lead" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "lead_assigne_a_idx" ON "lead" USING btree ("assigne_a_id");--> statement-breakpoint
CREATE INDEX "compte_client_entreprise_idx" ON "compte_client" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "contact_entreprise_idx" ON "contact" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "contact_compte_idx" ON "contact" USING btree ("compte_id");--> statement-breakpoint
CREATE INDEX "contact_assigne_a_idx" ON "contact" USING btree ("assigne_a_id");--> statement-breakpoint
CREATE INDEX "deal_entreprise_idx" ON "deal" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "deal_contact_idx" ON "deal" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "deal_assigne_a_idx" ON "deal" USING btree ("assigne_a_id");--> statement-breakpoint
CREATE INDEX "historique_statut_deal_entreprise_idx" ON "historique_statut_deal" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "historique_statut_deal_deal_idx" ON "historique_statut_deal" USING btree ("deal_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "lead" AS PERMISSIVE FOR ALL TO public USING ("lead"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("lead"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "compte_client" AS PERMISSIVE FOR ALL TO public USING ("compte_client"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("compte_client"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "contact" AS PERMISSIVE FOR ALL TO public USING ("contact"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("contact"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "deal" AS PERMISSIVE FOR ALL TO public USING ("deal"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("deal"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "historique_statut_deal" AS PERMISSIVE FOR ALL TO public USING ("historique_statut_deal"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("historique_statut_deal"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint

ALTER TABLE "interaction" DROP CONSTRAINT "interaction_prospect_id_prospect_id_fk";--> statement-breakpoint
DROP INDEX "interaction_prospect_idx";--> statement-breakpoint
ALTER TABLE "interaction" RENAME COLUMN "prospect_id" TO "contact_id";--> statement-breakpoint
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interaction_contact_idx" ON "interaction" USING btree ("contact_id");--> statement-breakpoint

ALTER TABLE "devis" DROP CONSTRAINT "devis_prospect_id_prospect_id_fk";--> statement-breakpoint
ALTER TABLE "devis" RENAME COLUMN "prospect_id" TO "deal_id";--> statement-breakpoint
ALTER TABLE "devis" ADD CONSTRAINT "devis_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "facture" DROP CONSTRAINT "facture_prospect_id_prospect_id_fk";--> statement-breakpoint
ALTER TABLE "facture" RENAME COLUMN "prospect_id" TO "deal_id";--> statement-breakpoint
ALTER TABLE "facture" ADD CONSTRAINT "facture_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "dossier" DROP CONSTRAINT "dossier_prospect_id_prospect_id_fk";--> statement-breakpoint
DROP INDEX "dossier_entreprise_prospect_unique";--> statement-breakpoint
ALTER TABLE "dossier" RENAME COLUMN "prospect_id" TO "contact_id";--> statement-breakpoint
ALTER TABLE "dossier" ADD CONSTRAINT "dossier_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dossier_entreprise_contact_unique" ON "dossier" USING btree ("entreprise_id","contact_id");--> statement-breakpoint

DROP TABLE "historique_statut_prospect";--> statement-breakpoint
DROP TABLE "prospect";--> statement-breakpoint
DROP TYPE "public"."statut_prospect";

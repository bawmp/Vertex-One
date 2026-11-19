-- Relance automatique des prospects qualifiés (2026-11-19). Rejouable.
-- Entreprise : réglage DÉSACTIVÉ par défaut (la séquence envoie des e-mails aux prospects sans clic), délais en jours après la qualification, plafond par jour.
ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "sequence_prospects_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "sequence_prospects_delais" text DEFAULT '3,7,14' NOT NULL;--> statement-breakpoint
ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "sequence_prospects_plafond" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
-- Lead : où en est sa séquence (nombre d'e-mails automatiques envoyés, dernier envoi, arrêt éventuel et son motif).
ALTER TABLE "lead" ADD COLUMN IF NOT EXISTS "sequence_etape" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN IF NOT EXISTS "sequence_derniere_le" timestamp;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN IF NOT EXISTS "sequence_arretee_le" timestamp;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN IF NOT EXISTS "sequence_arret_motif" text;--> statement-breakpoint
-- Historique des relances : marque les e-mails partis automatiquement (aucun utilisateur humain déclencheur).
ALTER TABLE "relance_prospect" ADD COLUMN IF NOT EXISTS "automatique" boolean DEFAULT false NOT NULL;

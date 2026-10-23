-- Espace client (2026-10-23) : adresse de la page où un client suit sa procédure, transmise par le site de l'entreprise (API des
-- leads) puis reprise sur le contact ; le client y est renvoyé à la fin de son parcours. Deux colonnes nullables : rejouable.
ALTER TABLE "lead" ADD COLUMN IF NOT EXISTS "espace_client_url" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "espace_client_url" text;

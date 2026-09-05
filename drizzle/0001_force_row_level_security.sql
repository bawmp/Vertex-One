-- Sans FORCE, une politique RLS ne s'applique PAS au propriétaire de la
-- table — précisément le rôle utilisé par la connexion applicative (Neon).
-- Sans cette clause, toutes les politiques créées en 0000 seraient
-- silencieusement contournées par ce même rôle. Voir CLAUDE.md.
ALTER TABLE "account" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "domaine_email" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dossier_rh" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invitation" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "utilisateur" FORCE ROW LEVEL SECURITY;

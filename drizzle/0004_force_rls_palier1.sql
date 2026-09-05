-- Sans FORCE, une politique RLS ne s'applique pas au propriétaire de la
-- table — précisément le rôle utilisé par la connexion applicative. Voir
-- drizzle/0001_force_row_level_security.sql et CLAUDE.md.
ALTER TABLE "prospect" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "interaction" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "devis" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ligne_devis" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "facture" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ligne_facture" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "paiement" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "avoir_facture" FORCE ROW LEVEL SECURITY;

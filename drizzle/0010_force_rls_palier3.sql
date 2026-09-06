-- Sans FORCE, une politique RLS ne s'applique pas au propriétaire de la
-- table — précisément le rôle utilisé par la connexion applicative. Voir
-- drizzle/0001_force_row_level_security.sql et CLAUDE.md.
ALTER TABLE "canal" FORCE ROW LEVEL SECURITY;
ALTER TABLE "document" FORCE ROW LEVEL SECURITY;
ALTER TABLE "journal_acces_document" FORCE ROW LEVEL SECURITY;
ALTER TABLE "annonce" FORCE ROW LEVEL SECURITY;

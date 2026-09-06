-- Sans FORCE, une politique RLS ne s'applique pas au propriétaire de la
-- table — précisément le rôle utilisé par la connexion applicative. Voir
-- drizzle/0001_force_row_level_security.sql et CLAUDE.md.
ALTER TABLE "dossier" FORCE ROW LEVEL SECURITY;
ALTER TABLE "projet" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tache" FORCE ROW LEVEL SECURITY;
ALTER TABLE "commentaire" FORCE ROW LEVEL SECURITY;

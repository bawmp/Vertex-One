-- Sans FORCE, une politique RLS ne s'applique pas au propriétaire de la
-- table — précisément le rôle utilisé par la connexion applicative. Voir
-- drizzle/0001_force_row_level_security.sql et CLAUDE.md.
--
-- compte_comptable n'apparaît pas ici : c'est un référentiel global partagé
-- (plan comptable SYSCOHADA), pas une donnée d'entreprise — voir
-- src/db/schema.ts, aucune politique RLS n'y est définie non plus.
ALTER TABLE "demande_signature" FORCE ROW LEVEL SECURITY;
ALTER TABLE "signataire" FORCE ROW LEVEL SECURITY;
ALTER TABLE "contrat" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ecriture_comptable" FORCE ROW LEVEL SECURITY;

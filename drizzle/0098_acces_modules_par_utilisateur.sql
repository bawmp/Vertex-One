-- Accès par module choisi par l'Administrateur (2026-09-20) : deux colonnes
-- nullables (null = tous les modules du rôle), aucune nouvelle table ni
-- politique RLS. Rejouable sans erreur (IF NOT EXISTS).
ALTER TABLE "utilisateur" ADD COLUMN IF NOT EXISTS "modules_autorises" json;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN IF NOT EXISTS "modules_propose" json;

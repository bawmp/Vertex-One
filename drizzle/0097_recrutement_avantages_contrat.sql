-- Page carrières (2026-09-19) : deux colonnes nullables, aucune nouvelle table
-- ni politique RLS. Rejouable sans erreur (IF NOT EXISTS).
ALTER TABLE "parametre_recrutement" ADD COLUMN IF NOT EXISTS "avantages" json;--> statement-breakpoint
ALTER TABLE "poste_ouvert" ADD COLUMN IF NOT EXISTS "type_contrat" text;

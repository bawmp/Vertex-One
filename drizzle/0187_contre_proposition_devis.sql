-- Contre-proposition facultative du client dans sa demande de révision de devis (2026-11-21). Rejouable.
ALTER TABLE "demande_revision_devis" ADD COLUMN IF NOT EXISTS "contre_montant" integer;--> statement-breakpoint
ALTER TABLE "demande_revision_devis" ADD COLUMN IF NOT EXISTS "contre_conditions" text;
--> statement-breakpoint
-- Réglage par entreprise : le client peut-il demander la révision d'un devis depuis son lien ? (activé par défaut)
ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "revision_devis_active" boolean DEFAULT true NOT NULL;

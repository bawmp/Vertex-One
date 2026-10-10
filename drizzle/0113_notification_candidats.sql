-- One Recruit : le candidat est prévenu par email à chaque changement de statut de sa candidature (2026-10-11).
-- Réglage par entreprise, activé par défaut ; l'Administrateur peut le couper dans Recrutement → Paramètres. Rejouable.
ALTER TABLE "parametre_recrutement" ADD COLUMN IF NOT EXISTS "notifier_candidats" boolean DEFAULT true NOT NULL;

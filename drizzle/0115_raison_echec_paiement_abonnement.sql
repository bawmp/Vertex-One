-- Raison d'un échec de paiement d'abonnement (2026-10-13) : le prestataire dit pourquoi (solde MoMo insuffisant, expiré,
-- annulé…), affiché au client à la place d'un échec générique. Colonne nullable, rejouable (IF NOT EXISTS). Aucune
-- politique RLS à toucher : la table en a déjà, une colonne de plus ne change rien à l'isolation.
ALTER TABLE "tentative_paiement_abonnement" ADD COLUMN IF NOT EXISTS "raison_echec" text;

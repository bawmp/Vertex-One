-- Paiement direct sans redirection des factures (2026-10-25) : comme l'abonnement, une tentative de paiement de facture conserve le
-- payToken renvoyé par Aangaraa Pay (pour relire activement le statut : la notification n'arrive qu'une fois, transaction encore
-- PENDING) et la raison d'un échec (solde insuffisant, expirée…). Colonnes nullables : les anciennes tentatives restent valides.
ALTER TABLE "tentative_paiement_facture" ADD COLUMN IF NOT EXISTS "pay_token" text;
ALTER TABLE "tentative_paiement_facture" ADD COLUMN IF NOT EXISTS "raison_echec" text;

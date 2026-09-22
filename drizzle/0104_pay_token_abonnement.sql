-- Paiement direct (2026-09-22) : conserve le payToken d'une tentative d'abonnement pour une relecture active du
-- statut (Aangaraa Pay n'appelle notify_url qu'une fois, immédiatement, jamais une seconde fois quand le client
-- valide réellement sur son téléphone). Colonne nullable, aucune donnée existante à migrer. Rejouable sans erreur.
--
-- Écrite à la main : `drizzle-kit generate` échoue actuellement sur un dérapage préexistant entre le schéma réel
-- et le suivi de migrations (plusieurs tables de production, dont tentative_paiement_abonnement elle-même,
-- manquent du dernier instantané généré) — sans lien avec ce changement, à corriger séparément.
ALTER TABLE "tentative_paiement_abonnement" ADD COLUMN IF NOT EXISTS "pay_token" text;

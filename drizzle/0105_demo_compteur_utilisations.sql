-- Démo publique (2026-09-28) : compteur du nombre de connexions automatiques via "Voir la démo" (site
-- vitrine, voir src/lib/actions/demo.ts), affiché à la Console interne (/plateforme). Reste à 0 pour
-- toute vraie entreprise cliente. Colonne notNull avec défaut, aucune donnée existante à migrer.
--
-- Écrite à la main, comme 0104_pay_token_abonnement.sql : `drizzle-kit generate` échoue toujours sur le
-- même dérapage préexistant entre le schéma réel et le suivi de migrations (instantané manquant),
-- indépendant de ce changement.
ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "compteur_utilisations_demo" integer DEFAULT 0 NOT NULL;

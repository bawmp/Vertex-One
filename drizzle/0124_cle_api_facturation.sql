-- Clés d'API : autorisation « factures » (2026-10-25). Une clé de site peut déposer des leads ; elle ne peut créer des factures payées (donc des
-- écritures comptables, jamais supprimables) que si l'Administrateur l'y autorise explicitement. Refusé par défaut, y compris pour les clés existantes.
ALTER TABLE "cle_api_entreprise" ADD COLUMN IF NOT EXISTS "autorise_facturation" boolean DEFAULT false NOT NULL;

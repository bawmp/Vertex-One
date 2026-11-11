-- Bulletin de paie : brouillon modifiable jusqu'à son envoi à la personne (2026-11-11).
ALTER TABLE "paiement_salaire" ADD COLUMN IF NOT EXISTS "envoye_le" timestamp;

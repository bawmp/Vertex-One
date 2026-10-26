-- Partage du recrutement entre les entreprises d'un groupe (2026-10-26) : réglage par entreprise, désactivé par défaut (aucun changement pour
-- les entreprises existantes). Deux entreprises du même groupe ne voient leurs postes et candidatures que si LES DEUX l'ont activé.
ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "recrutement_partage_groupe" boolean DEFAULT false NOT NULL;

-- Fin de contrat proposée à l'invitation (2026-10-27) : un stagiaire professionnel a sa date de fin de stage dès l'invitation, copiée vers
-- dossier_rh.date_fin_contrat à l'activation. Colonne nullable, aucune table nouvelle (RLS de `invitation` inchangée). Rejouable.
ALTER TABLE "invitation" ADD COLUMN IF NOT EXISTS "date_fin_propose" timestamp;

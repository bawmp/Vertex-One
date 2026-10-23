-- Réglage du filigrane (2026-10-23) : le logo de l'entreprise en filigrane sur ses PDF de vente est activé par défaut, et
-- désactivable par l'Administrateur. Une colonne par entreprise, valeur par défaut « activé » : rien ne change tant qu'on n'y touche pas.
ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "filigrane_documents" boolean DEFAULT true NOT NULL;

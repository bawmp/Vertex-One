-- Réglage « Les managers voient toute l'entreprise » (2026-10-26) : un Manager ne voit par défaut que ce qui est assigné à lui ou à son équipe,
-- ce qui laisse son espace vide tant qu'il n'a ni équipe ni fiches à lui. Un réglage par entreprise, désactivé par défaut (aucun changement
-- pour les entreprises existantes), que l'Administrateur active dans Paramètres.
ALTER TABLE "entreprise" ADD COLUMN IF NOT EXISTS "managers_voient_tout" boolean DEFAULT false NOT NULL;

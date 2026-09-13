-- Prévention réelle des doubles réservations, sous concurrence.
--
-- demarrerMinuteur() (minuteur_actif) protège une valeur EXACTE (un seul
-- minuteur actif par utilisateur) via un uniqueIndex — insuffisant ici car
-- il s'agit d'un chevauchement de PLAGE HORAIRE, qu'un index unique ne peut
-- pas exprimer. Sous forte concurrence anonyme sur un créneau populaire
-- (ex. "14h, seul coiffeur disponible"), une vérification SELECT-puis-INSERT
-- dans une même transaction applicative reste théoriquement contournable :
-- deux transactions concurrentes peuvent chacune lire "aucun conflit" avant
-- que l'une des deux ne valide son INSERT. Le code applicatif garde une
-- vérification préalable (même esprit que demarrerMinuteur()) uniquement
-- pour un message d'erreur convivial ; cette contrainte est la seule vraie
-- autorité contre la race, au niveau base de données.
--
-- Première utilisation de EXCLUDE/btree_gist dans ce projet — btree_gist
-- est nécessaire pour combiner une égalité (intervenant_id) et un
-- chevauchement de plage (tstzrange) dans un même index GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "reservation"
  ADD CONSTRAINT "reservation_intervenant_pas_de_chevauchement"
  EXCLUDE USING gist (
    intervenant_id WITH =,
    tstzrange(date_debut, date_fin, '[)') WITH &&
  )
  WHERE (statut IN ('CONFIRMEE', 'TERMINEE'));

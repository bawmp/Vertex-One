-- Champ « Fichier » de One Form (2026-09-19) : nouvelle valeur d'enum. Aucune
-- colonne ni table ajoutée — les catégories acceptées réutilisent
-- champ_formulaire.options, la référence du fichier réutilise
-- valeur_champ_reponse.valeur (JSON), donc aucune nouvelle politique RLS.
ALTER TYPE "type_champ_formulaire" ADD VALUE IF NOT EXISTS 'FICHIER';

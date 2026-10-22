-- Suppression d'un Manager, Employé ou client du portail par l'Administrateur (2026-10-22) : le compte est retiré (plus de
-- connexion, plus dans les listes) mais la ligne reste, pour que l'historique (documents, tâches, messages) garde son auteur.
ALTER TYPE "public"."statut_utilisateur" ADD VALUE IF NOT EXISTS 'SUPPRIME';

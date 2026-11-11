-- Nouveau modèle d'email : message au client « votre profil est dans le bassin Entrée express » (2026-11-11).
ALTER TYPE "public"."type_modele_email" ADD VALUE IF NOT EXISTS 'MESSAGE_BASSIN';

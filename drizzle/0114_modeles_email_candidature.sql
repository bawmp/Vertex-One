-- Textes des emails envoyés aux candidats (One Recruit) personnalisables comme ceux des devis et factures (2026-10-11) :
-- un modèle par statut de candidature, dans la même table `modele_email`. Rejouable (IF NOT EXISTS).
-- Une valeur d'enum ajoutée ne peut pas être utilisée dans la même transaction : aucune ligne n'est insérée ici, les
-- modèles par défaut sont codés dans src/lib/email/modeles.ts.
ALTER TYPE "public"."type_modele_email" ADD VALUE IF NOT EXISTS 'CANDIDATURE_EN_EXAMEN';--> statement-breakpoint
ALTER TYPE "public"."type_modele_email" ADD VALUE IF NOT EXISTS 'CANDIDATURE_ENTRETIEN';--> statement-breakpoint
ALTER TYPE "public"."type_modele_email" ADD VALUE IF NOT EXISTS 'CANDIDATURE_OFFRE';--> statement-breakpoint
ALTER TYPE "public"."type_modele_email" ADD VALUE IF NOT EXISTS 'CANDIDATURE_EMBAUCHE';--> statement-breakpoint
ALTER TYPE "public"."type_modele_email" ADD VALUE IF NOT EXISTS 'CANDIDATURE_REJETEE';

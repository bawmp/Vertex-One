ALTER TABLE "entreprise" ADD COLUMN "essai_fin_le" timestamp NOT NULL DEFAULT (now() + interval '14 days');--> statement-breakpoint
ALTER TABLE "entreprise" ADD COLUMN "abonnement_echeance_le" timestamp NOT NULL DEFAULT (now() + interval '14 days');--> statement-breakpoint
ALTER TABLE "entreprise" ADD COLUMN "dernier_rappel_abonnement_envoye" text;

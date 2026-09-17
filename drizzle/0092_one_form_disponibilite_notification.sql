ALTER TABLE "formulaire" ADD COLUMN "notifier_par_email" boolean DEFAULT false NOT NULL;
ALTER TABLE "formulaire" ADD COLUMN "ouverture_le" timestamp;
ALTER TABLE "formulaire" ADD COLUMN "fermeture_le" timestamp;
ALTER TABLE "formulaire" ADD COLUMN "limite_reponses" integer;

-- A qui vont les prospects reçus d'un site connecté (clé d'API) ou d'une page Facebook : règle choisie par l'Administrateur, null = premier administrateur.
ALTER TABLE "cle_api_entreprise" ADD COLUMN IF NOT EXISTS "assignation" json;
--> statement-breakpoint
ALTER TABLE "connexion_facebook" ADD COLUMN IF NOT EXISTS "assignation" json;

ALTER TABLE "utilisateur" DROP CONSTRAINT IF EXISTS "utilisateur_entreprise_email_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "utilisateur_entreprise_email_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "utilisateur_email_unique" ON "utilisateur" USING btree ("email");

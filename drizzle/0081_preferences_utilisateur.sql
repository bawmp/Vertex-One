ALTER TABLE "utilisateur" ADD COLUMN "langue" text NOT NULL DEFAULT 'fr';--> statement-breakpoint
ALTER TABLE "utilisateur" ADD COLUMN "theme" text NOT NULL DEFAULT 'systeme';--> statement-breakpoint
ALTER TABLE "utilisateur" ADD COLUMN "ordre_modules" json;

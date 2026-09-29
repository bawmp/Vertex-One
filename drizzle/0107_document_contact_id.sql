-- Documents rattachables directement à un Contact (2026-09-29), en plus de dossierId/projetId — voir
-- src/db/schema.ts. Rejouable sans erreur.
ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "contact_id" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "document" ADD CONSTRAINT "document_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_contact_idx" ON "document" USING btree ("contact_id");--> statement-breakpoint
-- Backfill : tout document déjà rattaché à un Dossier hérite du contact de ce dossier, pour redevenir
-- immédiatement retrouvable depuis la fiche Contact sans avoir à re-téléverser quoi que ce soit.
UPDATE "document" SET "contact_id" = "dossier"."contact_id"
FROM "dossier"
WHERE "document"."dossier_id" = "dossier"."id" AND "document"."contact_id" IS NULL;

-- Images de produits chargees depuis une adresse web (import de produits) (2026-11-13).
-- `image_source_url` : adresse HTTPS de l'image a telecharger (vidée des que l'image est stockee ou refusee definitivement).
-- `image_source_erreur` : motif simple d'un refus definitif (adresse inaccessible, fichier qui n'est pas une image, trop lourd...).
ALTER TABLE "produit" ADD COLUMN IF NOT EXISTS "image_source_url" text;--> statement-breakpoint
ALTER TABLE "produit" ADD COLUMN IF NOT EXISTS "image_source_erreur" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "produit_image_en_attente_idx" ON "produit" USING btree ("entreprise_id") WHERE "produit"."image_source_url" IS NOT NULL;

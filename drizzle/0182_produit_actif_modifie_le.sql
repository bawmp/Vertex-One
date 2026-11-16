-- Produit actif / masqué et date de dernière modification (2026-11-16), pour la synchronisation dans les DEUX sens avec la boutique en ligne.
-- `actif` : un produit masqué (faux) n'est plus proposé dans les nouveaux documents (devis, factures, bons de commande…) ; il reste dans la liste et ses documents.
-- `modifie_le` : tenue par la BASE (déclencheur), pour couvrir tous les chemins de modification (formulaire, import, synchronisation) : elle ne change que
--   quand le nom, la description, le prix de vente, le prix d'achat ou l'état actif change — jamais pour un mouvement de stock ou une image.
ALTER TABLE "produit" ADD COLUMN IF NOT EXISTS "actif" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "produit" ADD COLUMN IF NOT EXISTS "modifie_le" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "produit" SET "modifie_le" = "cree_le";--> statement-breakpoint
CREATE OR REPLACE FUNCTION produit_modifie_le() RETURNS trigger AS $$
BEGIN
  IF NEW.nom IS DISTINCT FROM OLD.nom
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.prix_vente IS DISTINCT FROM OLD.prix_vente
     OR NEW.prix_achat IS DISTINCT FROM OLD.prix_achat
     OR NEW.actif IS DISTINCT FROM OLD.actif THEN
    NEW.modifie_le := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS produit_modifie_le_trg ON "produit";--> statement-breakpoint
CREATE TRIGGER produit_modifie_le_trg BEFORE UPDATE ON "produit" FOR EACH ROW EXECUTE FUNCTION produit_modifie_le();

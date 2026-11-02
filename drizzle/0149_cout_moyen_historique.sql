ALTER TABLE "mouvement_stock" ADD COLUMN IF NOT EXISTS "cout_moyen_apres" integer;--> statement-breakpoint
UPDATE "mouvement_stock" m SET "cout_moyen_apres" = p."cout_moyen" FROM "produit" p WHERE p."id" = m."produit_id" AND m."cout_moyen_apres" IS NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION mouvement_stock_cout_moyen() RETURNS trigger AS $$
BEGIN
  IF NEW.cout_moyen_apres IS NULL THEN
    SELECT p.cout_moyen INTO NEW.cout_moyen_apres FROM produit p WHERE p.id = NEW.produit_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS mouvement_stock_cout_moyen_trg ON "mouvement_stock";--> statement-breakpoint
CREATE TRIGGER mouvement_stock_cout_moyen_trg BEFORE INSERT ON "mouvement_stock" FOR EACH ROW EXECUTE FUNCTION mouvement_stock_cout_moyen();

-- Fiche détail Produit (échange du 2026-09-08) — écrit à la main
-- (drizzle-kit generate exige un terminal interactif indisponible dans cet
-- environnement, voir drizzle/0021_leads_contacts_comptes_deals.sql).
ALTER TABLE "produit" ADD COLUMN "image_cle_stockage" text;--> statement-breakpoint
ALTER TABLE "produit" ADD COLUMN "image_type_mime" text;--> statement-breakpoint
ALTER TABLE "produit" ADD COLUMN "cree_par_id" text;--> statement-breakpoint

-- Backfill : aucune vraie donnée client n'existe encore (uniquement des
-- entreprises "TEST %"), on rattache chaque produit existant au premier
-- utilisateur (par ancienneté) de son entreprise plutôt que de forcer une
-- valeur arbitraire à la main pour chaque ligne.
UPDATE "produit" p
SET "cree_par_id" = (
  SELECT u.id FROM "utilisateur" u
  WHERE u.entreprise_id = p.entreprise_id
  ORDER BY u.cree_le ASC
  LIMIT 1
)
WHERE p."cree_par_id" IS NULL;--> statement-breakpoint

ALTER TABLE "produit" ALTER COLUMN "cree_par_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "produit" ADD CONSTRAINT "produit_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;

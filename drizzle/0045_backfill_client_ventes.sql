-- Découplage Books/CRM, tranche 2/8 — remplit contact_id/compte_id/
-- assigne_a_id pour toute ligne existante qui a un deal_id, à partir du
-- Deal lui-même (comportement identique à aujourd'hui : ces colonnes ne
-- font ici que rendre explicite ce qui était jusque-là dérivé via une
-- jointure deal à chaque lecture). Exécuté via DATABASE_URL_MIGRATIONS
-- (rôle owner, une seule passe toutes entreprises confondues).

UPDATE "devis" SET
  "contact_id" = "deal"."contact_id",
  "compte_id" = "deal"."compte_id",
  "assigne_a_id" = "deal"."assigne_a_id"
FROM "deal"
WHERE "devis"."deal_id" = "deal"."id" AND "devis"."contact_id" IS NULL;
--> statement-breakpoint

UPDATE "facture" SET
  "contact_id" = "deal"."contact_id",
  "compte_id" = "deal"."compte_id",
  "assigne_a_id" = "deal"."assigne_a_id"
FROM "deal"
WHERE "facture"."deal_id" = "deal"."id" AND "facture"."contact_id" IS NULL;
--> statement-breakpoint

UPDATE "bon_commande_vente" SET
  "contact_id" = "deal"."contact_id",
  "compte_id" = "deal"."compte_id",
  "assigne_a_id" = "deal"."assigne_a_id"
FROM "deal"
WHERE "bon_commande_vente"."deal_id" = "deal"."id" AND "bon_commande_vente"."contact_id" IS NULL;
--> statement-breakpoint

UPDATE "facture_recurrente" SET
  "contact_id" = "deal"."contact_id",
  "compte_id" = "deal"."compte_id",
  "assigne_a_id" = "deal"."assigne_a_id"
FROM "deal"
WHERE "facture_recurrente"."deal_id" = "deal"."id" AND "facture_recurrente"."contact_id" IS NULL;
--> statement-breakpoint

UPDATE "recu_vente" SET
  "contact_id" = "deal"."contact_id",
  "compte_id" = "deal"."compte_id",
  "assigne_a_id" = "deal"."assigne_a_id"
FROM "deal"
WHERE "recu_vente"."deal_id" = "deal"."id" AND "recu_vente"."contact_id" IS NULL;
--> statement-breakpoint

UPDATE "facture_acompte" SET
  "contact_id" = "deal"."contact_id",
  "compte_id" = "deal"."compte_id",
  "assigne_a_id" = "deal"."assigne_a_id"
FROM "deal"
WHERE "facture_acompte"."deal_id" = "deal"."id" AND "facture_acompte"."contact_id" IS NULL;

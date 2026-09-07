-- Découplage Books/CRM, tranche 7/8 (contract final) : contactId/assigneAId
-- deviennent la seule source de vérité obligatoire du client sur les 6
-- tables de documents Ventes — vérifié 0 ligne à NULL sur contact_id avant
-- cette migration (voir tranches 2 et 3-6, qui ont backfillé/aligné tout le
-- code applicatif). dealId reste nullable (relâché dès la tranche 3).
ALTER TABLE "devis" ALTER COLUMN "contact_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "devis" ALTER COLUMN "assigne_a_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "facture" ALTER COLUMN "contact_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "facture" ALTER COLUMN "assigne_a_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "bon_commande_vente" ALTER COLUMN "contact_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bon_commande_vente" ALTER COLUMN "assigne_a_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "facture_recurrente" ALTER COLUMN "contact_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "facture_recurrente" ALTER COLUMN "assigne_a_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "recu_vente" ALTER COLUMN "contact_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "recu_vente" ALTER COLUMN "assigne_a_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "facture_acompte" ALTER COLUMN "contact_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "facture_acompte" ALTER COLUMN "assigne_a_id" SET NOT NULL;

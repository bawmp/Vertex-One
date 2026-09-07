-- Découplage Books/CRM, correction découverte à l'exécution de la tranche 3 :
-- resoudreClientVente() a besoin d'insérer un dealId NULL pour un document
-- créé directement depuis un Contact (sans Deal) — cette relaxation, prévue
-- en toute fin de chantier (tranche 7), doit en réalité arriver maintenant :
-- sans elle, aucune insertion "sans Deal" n'est possible avant la fin
-- complète du chantier, ce qui bloque les tranches intermédiaires (5, 5bis)
-- qui doivent pouvoir tester ce chemin. Relâcher une contrainte NOT NULL est
-- une opération sûre à tout moment (aucune donnée existante ne peut la
-- violer) — contrairement au resserrement inverse (tranche 7), qui exige un
-- backfill préalable.
ALTER TABLE "devis" ALTER COLUMN "deal_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "facture" ALTER COLUMN "deal_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bon_commande_vente" ALTER COLUMN "deal_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "facture_recurrente" ALTER COLUMN "deal_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recu_vente" ALTER COLUMN "deal_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "facture_acompte" ALTER COLUMN "deal_id" DROP NOT NULL;

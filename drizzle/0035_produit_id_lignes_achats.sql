ALTER TABLE "ligne_facture_fournisseur" ADD COLUMN "produit_id" text;--> statement-breakpoint
ALTER TABLE "ligne_bon_commande_achat" ADD COLUMN "produit_id" text;--> statement-breakpoint

ALTER TABLE "ligne_facture_fournisseur" ADD CONSTRAINT "ligne_facture_fournisseur_produit_id_produit_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligne_bon_commande_achat" ADD CONSTRAINT "ligne_bon_commande_achat_produit_id_produit_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produit"("id") ON DELETE no action ON UPDATE no action;

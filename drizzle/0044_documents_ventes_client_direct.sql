ALTER TABLE "devis" ADD COLUMN "contact_id" text;--> statement-breakpoint
ALTER TABLE "devis" ADD COLUMN "compte_id" text;--> statement-breakpoint
ALTER TABLE "devis" ADD COLUMN "assigne_a_id" text;--> statement-breakpoint

ALTER TABLE "facture" ADD COLUMN "contact_id" text;--> statement-breakpoint
ALTER TABLE "facture" ADD COLUMN "compte_id" text;--> statement-breakpoint
ALTER TABLE "facture" ADD COLUMN "assigne_a_id" text;--> statement-breakpoint

ALTER TABLE "bon_commande_vente" ADD COLUMN "contact_id" text;--> statement-breakpoint
ALTER TABLE "bon_commande_vente" ADD COLUMN "compte_id" text;--> statement-breakpoint
ALTER TABLE "bon_commande_vente" ADD COLUMN "assigne_a_id" text;--> statement-breakpoint

ALTER TABLE "facture_recurrente" ADD COLUMN "contact_id" text;--> statement-breakpoint
ALTER TABLE "facture_recurrente" ADD COLUMN "compte_id" text;--> statement-breakpoint
ALTER TABLE "facture_recurrente" ADD COLUMN "assigne_a_id" text;--> statement-breakpoint

ALTER TABLE "recu_vente" ADD COLUMN "contact_id" text;--> statement-breakpoint
ALTER TABLE "recu_vente" ADD COLUMN "compte_id" text;--> statement-breakpoint
ALTER TABLE "recu_vente" ADD COLUMN "assigne_a_id" text;--> statement-breakpoint

ALTER TABLE "facture_acompte" ADD COLUMN "contact_id" text;--> statement-breakpoint
ALTER TABLE "facture_acompte" ADD COLUMN "compte_id" text;--> statement-breakpoint
ALTER TABLE "facture_acompte" ADD COLUMN "assigne_a_id" text;--> statement-breakpoint

ALTER TABLE "devis" ADD CONSTRAINT "devis_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devis" ADD CONSTRAINT "devis_compte_id_compte_client_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."compte_client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devis" ADD CONSTRAINT "devis_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "facture" ADD CONSTRAINT "facture_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture" ADD CONSTRAINT "facture_compte_id_compte_client_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."compte_client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture" ADD CONSTRAINT "facture_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "bon_commande_vente" ADD CONSTRAINT "bon_commande_vente_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bon_commande_vente" ADD CONSTRAINT "bon_commande_vente_compte_id_compte_client_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."compte_client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bon_commande_vente" ADD CONSTRAINT "bon_commande_vente_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "facture_recurrente" ADD CONSTRAINT "facture_recurrente_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture_recurrente" ADD CONSTRAINT "facture_recurrente_compte_id_compte_client_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."compte_client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture_recurrente" ADD CONSTRAINT "facture_recurrente_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "recu_vente" ADD CONSTRAINT "recu_vente_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recu_vente" ADD CONSTRAINT "recu_vente_compte_id_compte_client_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."compte_client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recu_vente" ADD CONSTRAINT "recu_vente_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "facture_acompte" ADD CONSTRAINT "facture_acompte_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture_acompte" ADD CONSTRAINT "facture_acompte_compte_id_compte_client_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."compte_client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture_acompte" ADD CONSTRAINT "facture_acompte_assigne_a_id_utilisateur_id_fk" FOREIGN KEY ("assigne_a_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "devis_contact_idx" ON "devis" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "devis_assigne_a_idx" ON "devis" USING btree ("assigne_a_id");--> statement-breakpoint

CREATE INDEX "facture_contact_idx" ON "facture" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "facture_assigne_a_idx" ON "facture" USING btree ("assigne_a_id");--> statement-breakpoint

CREATE INDEX "bon_commande_vente_contact_idx" ON "bon_commande_vente" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "bon_commande_vente_assigne_a_idx" ON "bon_commande_vente" USING btree ("assigne_a_id");--> statement-breakpoint

CREATE INDEX "facture_recurrente_contact_idx" ON "facture_recurrente" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "facture_recurrente_assigne_a_idx" ON "facture_recurrente" USING btree ("assigne_a_id");--> statement-breakpoint

CREATE INDEX "recu_vente_contact_idx" ON "recu_vente" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "recu_vente_assigne_a_idx" ON "recu_vente" USING btree ("assigne_a_id");--> statement-breakpoint

CREATE INDEX "facture_acompte_contact_idx" ON "facture_acompte" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "facture_acompte_assigne_a_idx" ON "facture_acompte" USING btree ("assigne_a_id");

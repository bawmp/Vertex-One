-- Migration cinetpay-js (2026-09-18) : l'API v1 de CinetPay impose
-- merchantTransactionId <= 30 caractères, incompatible avec l'ancien
-- préfixage entrepriseId+id (deux cuid2 de 24 caractères chacun). Ces deux
-- tables utilisent désormais leur propre `id` (cuid2, 24 caractères) comme
-- merchantTransactionId ; le webhook public retrouve l'entrepriseId par une
-- lecture RLS anonyme, même patron que "invitation" (voir
-- drizzle/0000_steady_morlocks.sql et drizzle/0002_skinny_vapor.sql).
DROP POLICY "isolation_entreprise" ON "tentative_paiement_facture";--> statement-breakpoint
CREATE POLICY "isolation_entreprise_lecture" ON "tentative_paiement_facture" AS PERMISSIVE FOR SELECT TO public USING ("tentative_paiement_facture"."entreprise_id" = current_setting('app.entreprise_id', true) OR nullif(current_setting('app.entreprise_id', true), '') IS NULL);--> statement-breakpoint
CREATE POLICY "isolation_entreprise_ecriture" ON "tentative_paiement_facture" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("tentative_paiement_facture"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise_modification" ON "tentative_paiement_facture" AS PERMISSIVE FOR UPDATE TO public USING ("tentative_paiement_facture"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("tentative_paiement_facture"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise_suppression" ON "tentative_paiement_facture" AS PERMISSIVE FOR DELETE TO public USING ("tentative_paiement_facture"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
DROP POLICY "isolation_entreprise" ON "tentative_paiement_abonnement";--> statement-breakpoint
CREATE POLICY "isolation_entreprise_lecture" ON "tentative_paiement_abonnement" AS PERMISSIVE FOR SELECT TO public USING ("tentative_paiement_abonnement"."entreprise_id" = current_setting('app.entreprise_id', true) OR nullif(current_setting('app.entreprise_id', true), '') IS NULL);--> statement-breakpoint
CREATE POLICY "isolation_entreprise_ecriture" ON "tentative_paiement_abonnement" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("tentative_paiement_abonnement"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise_modification" ON "tentative_paiement_abonnement" AS PERMISSIVE FOR UPDATE TO public USING ("tentative_paiement_abonnement"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("tentative_paiement_abonnement"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise_suppression" ON "tentative_paiement_abonnement" AS PERMISSIVE FOR DELETE TO public USING ("tentative_paiement_abonnement"."entreprise_id" = current_setting('app.entreprise_id', true));

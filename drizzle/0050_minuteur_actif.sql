-- Minuteur démarrer/arrêter (échange du 2026-09-07) — écrit à la main :
-- drizzle-kit generate exige un terminal interactif indisponible dans cet
-- environnement (le fil des migrations a divergé du schéma dès 0021, voir
-- drizzle/0021_leads_contacts_comptes_deals.sql pour le même constat), donc
-- toute nouvelle table passe par --custom + SQL manuel depuis.
CREATE TABLE "minuteur_actif" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"utilisateur_id" text NOT NULL,
	"projet_id" text NOT NULL,
	"tache_id" text,
	"demarre_le" timestamp DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "minuteur_actif" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "minuteur_actif" ADD CONSTRAINT "minuteur_actif_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minuteur_actif" ADD CONSTRAINT "minuteur_actif_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minuteur_actif" ADD CONSTRAINT "minuteur_actif_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minuteur_actif" ADD CONSTRAINT "minuteur_actif_tache_id_tache_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."tache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "minuteur_actif_utilisateur_unique" ON "minuteur_actif" USING btree ("utilisateur_id");--> statement-breakpoint
CREATE INDEX "minuteur_actif_entreprise_idx" ON "minuteur_actif" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "minuteur_actif_projet_idx" ON "minuteur_actif" USING btree ("projet_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "minuteur_actif" AS PERMISSIVE FOR ALL TO public USING ("minuteur_actif"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("minuteur_actif"."entreprise_id" = current_setting('app.entreprise_id', true));

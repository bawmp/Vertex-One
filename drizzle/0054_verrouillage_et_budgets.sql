ALTER TABLE "entreprise" ADD COLUMN "date_verrouillage_comptable" timestamp;--> statement-breakpoint

CREATE TABLE "budget" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"nom" text NOT NULL,
	"date_debut" timestamp NOT NULL,
	"date_fin" timestamp NOT NULL,
	"cree_par_id" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "budget_ligne" (
	"id" text PRIMARY KEY NOT NULL,
	"entreprise_id" text NOT NULL,
	"budget_id" text NOT NULL,
	"compte_id" text NOT NULL,
	"montant" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_ligne" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "budget" ADD CONSTRAINT "budget_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_ligne" ADD CONSTRAINT "budget_ligne_entreprise_id_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_ligne" ADD CONSTRAINT "budget_ligne_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_ligne" ADD CONSTRAINT "budget_ligne_compte_id_compte_comptable_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."compte_comptable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "budget_entreprise_idx" ON "budget" USING btree ("entreprise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_ligne_budget_compte_unique" ON "budget_ligne" USING btree ("budget_id","compte_id");--> statement-breakpoint
CREATE INDEX "budget_ligne_entreprise_idx" ON "budget_ligne" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "budget_ligne_budget_idx" ON "budget_ligne" USING btree ("budget_id");--> statement-breakpoint

CREATE POLICY "isolation_entreprise" ON "budget" AS PERMISSIVE FOR ALL TO public USING ("budget"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("budget"."entreprise_id" = current_setting('app.entreprise_id', true));--> statement-breakpoint
CREATE POLICY "isolation_entreprise" ON "budget_ligne" AS PERMISSIVE FOR ALL TO public USING ("budget_ligne"."entreprise_id" = current_setting('app.entreprise_id', true)) WITH CHECK ("budget_ligne"."entreprise_id" = current_setting('app.entreprise_id', true));

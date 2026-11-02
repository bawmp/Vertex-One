ALTER TABLE "compte_comptable" ADD COLUMN IF NOT EXISTS "entreprise_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compte_comptable" ADD CONSTRAINT "compte_comptable_entreprise_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TABLE "compte_comptable" DROP CONSTRAINT IF EXISTS "compte_comptable_numero_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "compte_comptable_numero_global_unique" ON "compte_comptable" USING btree ("numero") WHERE "compte_comptable"."entreprise_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "compte_comptable_numero_entreprise_unique" ON "compte_comptable" USING btree ("entreprise_id","numero") WHERE "compte_comptable"."entreprise_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compte_comptable_entreprise_idx" ON "compte_comptable" USING btree ("entreprise_id");--> statement-breakpoint
ALTER TABLE "compte_comptable" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "compte_comptable" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "compte_lecture" ON "compte_comptable" AS PERMISSIVE FOR SELECT TO public USING ("compte_comptable"."entreprise_id" IS NULL OR "compte_comptable"."entreprise_id" = nullif(current_setting('app.entreprise_id', true), ''));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "compte_creation" ON "compte_comptable" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("compte_comptable"."entreprise_id" = nullif(current_setting('app.entreprise_id', true), ''));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "compte_modification" ON "compte_comptable" AS PERMISSIVE FOR UPDATE TO public USING ("compte_comptable"."entreprise_id" = nullif(current_setting('app.entreprise_id', true), '')) WITH CHECK ("compte_comptable"."entreprise_id" = nullif(current_setting('app.entreprise_id', true), ''));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE POLICY "compte_suppression" ON "compte_comptable" AS PERMISSIVE FOR DELETE TO public USING ("compte_comptable"."entreprise_id" = nullif(current_setting('app.entreprise_id', true), ''));
EXCEPTION WHEN duplicate_object THEN null; END $$;

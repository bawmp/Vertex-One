ALTER TABLE "message_canal" ADD COLUMN IF NOT EXISTS "cite_message_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_canal" ADD CONSTRAINT "message_canal_cite_message_id_fk" FOREIGN KEY ("cite_message_id") REFERENCES "public"."message_canal"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_canal_cite_idx" ON "message_canal" USING btree ("cite_message_id");

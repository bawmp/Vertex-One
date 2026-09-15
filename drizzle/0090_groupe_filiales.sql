-- Custom SQL migration file, put your code below! --
CREATE TABLE "groupe" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"cree_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation_groupe" (
	"id" text PRIMARY KEY NOT NULL,
	"groupe_id" text NOT NULL,
	"jeton" text NOT NULL,
	"expire_le" timestamp NOT NULL,
	"utilisee_le" timestamp,
	"cree_le" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_groupe_jeton_unique" UNIQUE("jeton")
);
--> statement-breakpoint
ALTER TABLE "invitation_groupe" ADD CONSTRAINT "invitation_groupe_groupe_id_groupe_id_fk" FOREIGN KEY ("groupe_id") REFERENCES "public"."groupe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entreprise" ADD COLUMN "groupe_id" text;--> statement-breakpoint
ALTER TABLE "entreprise" ADD CONSTRAINT "entreprise_groupe_id_groupe_id_fk" FOREIGN KEY ("groupe_id") REFERENCES "public"."groupe"("id") ON DELETE no action ON UPDATE no action;

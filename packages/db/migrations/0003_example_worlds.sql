CREATE TABLE "example_actors" (
	"address" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"role" text NOT NULL,
	"part" text,
	"sealed_passkey" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "example_worlds" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "example_actors" ADD CONSTRAINT "example_actors_world_id_example_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."example_worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "example_actors_by_world" ON "example_actors" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "example_worlds_by_claim" ON "example_worlds" USING btree ("claimed_at");
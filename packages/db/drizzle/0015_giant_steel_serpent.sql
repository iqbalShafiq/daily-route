CREATE TABLE "map_places" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"address" text,
	"locality" text,
	"confidence" real,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"release" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "map_places_name_idx" ON "map_places" USING btree ("name");--> statement-breakpoint
CREATE INDEX "map_places_coordinates_idx" ON "map_places" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "map_places_name_trgm_idx" ON "map_places" USING gin ("name" gin_trgm_ops);
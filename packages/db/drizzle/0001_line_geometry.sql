CREATE TABLE "line_geometry" (
	"line_id" text NOT NULL,
	"direction" text DEFAULT 'forward' NOT NULL,
	"geometry" jsonb NOT NULL,
	"stop_offsets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"length_km" real NOT NULL,
	"point_count" integer NOT NULL,
	CONSTRAINT "line_geometry_line_id_direction_pk" PRIMARY KEY("line_id","direction")
);
--> statement-breakpoint
ALTER TABLE "line_geometry" ADD CONSTRAINT "line_geometry_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE cascade ON UPDATE no action;
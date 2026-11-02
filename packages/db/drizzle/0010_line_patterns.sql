CREATE TABLE "line_patterns" (
  "id" text PRIMARY KEY NOT NULL,
  "line_id" text NOT NULL,
  "code" text NOT NULL,
  "headsign" text NOT NULL,
  "direction" text NOT NULL,
  "pattern_type" text DEFAULT 'branch' NOT NULL,
  "stop_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "geometry" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "stop_offsets" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "service_days" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "service_label" text DEFAULT 'Daily' NOT NULL,
  "toll" boolean DEFAULT false NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "source" text DEFAULT 'gtfs' NOT NULL,
  "source_url" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER TABLE "line_patterns" ADD CONSTRAINT "line_patterns_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "line_patterns_line_idx" ON "line_patterns" USING btree ("line_id","direction");
CREATE INDEX "line_patterns_default_idx" ON "line_patterns" USING btree ("line_id","direction","is_default");

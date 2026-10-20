-- Extensions first: the `vector` column below needs pgvector, and the
-- trigram index powers the station name search.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text DEFAULT 'Percakapan rute' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disruptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_type" text NOT NULL,
	"external_id" text,
	"system_id" text,
	"line_id" text,
	"station_id" text,
	"station_group_id" text,
	"severity" text DEFAULT 'info' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"kind" text DEFAULT 'unknown' NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"url" text,
	"confidence" real DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"affected_station_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"affected_line_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "line_stops" (
	"line_id" text NOT NULL,
	"station_id" text NOT NULL,
	"direction" text DEFAULT 'forward' NOT NULL,
	"position" integer NOT NULL,
	"distance_from_origin_km" real,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "line_stops_line_id_station_id_direction_position_pk" PRIMARY KEY("line_id","station_id","direction","position")
);
--> statement-breakpoint
CREATE TABLE "lines" (
	"id" text PRIMARY KEY NOT NULL,
	"system_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"mode" text NOT NULL,
	"service_class" text NOT NULL,
	"operator" text NOT NULL,
	"status" text DEFAULT 'operating' NOT NULL,
	"color" text,
	"length_km" real,
	"description" text DEFAULT '' NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"source" text,
	"query" text,
	"score" real,
	"published_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disruption_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin_station_id" text,
	"destination_station_id" text,
	"origin_text" text DEFAULT '' NOT NULL,
	"destination_text" text DEFAULT '' NOT NULL,
	"itineraries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text DEFAULT 'x' NOT NULL,
	"external_id" text NOT NULL,
	"author_handle" text NOT NULL,
	"author_name" text,
	"text" text NOT NULL,
	"url" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disruption_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_embeddings" (
	"station_id" text NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "station_embeddings_station_id_model_pk" PRIMARY KEY("station_id","model")
);
--> statement-breakpoint
CREATE TABLE "station_group_members" (
	"group_id" text NOT NULL,
	"station_id" text NOT NULL,
	"walk_minutes" real,
	CONSTRAINT "station_group_members_group_id_station_id_pk" PRIMARY KEY("group_id","station_id")
);
--> statement-breakpoint
CREATE TABLE "station_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" text PRIMARY KEY NOT NULL,
	"system_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"station_type" text DEFAULT 'stop' NOT NULL,
	"zone" text,
	"is_interchange" boolean DEFAULT false NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"area" text,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "systems" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mode" text NOT NULL,
	"operator" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#0f172a' NOT NULL,
	"website" text,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disruptions" ADD CONSTRAINT "disruptions_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disruptions" ADD CONSTRAINT "disruptions_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disruptions" ADD CONSTRAINT "disruptions_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disruptions" ADD CONSTRAINT "disruptions_station_group_id_station_groups_id_fk" FOREIGN KEY ("station_group_id") REFERENCES "public"."station_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_stops" ADD CONSTRAINT "line_stops_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_stops" ADD CONSTRAINT "line_stops_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lines" ADD CONSTRAINT "lines_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_items" ADD CONSTRAINT "news_items_disruption_id_disruptions_id_fk" FOREIGN KEY ("disruption_id") REFERENCES "public"."disruptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_plans" ADD CONSTRAINT "route_plans_origin_station_id_stations_id_fk" FOREIGN KEY ("origin_station_id") REFERENCES "public"."stations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_plans" ADD CONSTRAINT "route_plans_destination_station_id_stations_id_fk" FOREIGN KEY ("destination_station_id") REFERENCES "public"."stations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_disruption_id_disruptions_id_fk" FOREIGN KEY ("disruption_id") REFERENCES "public"."disruptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_embeddings" ADD CONSTRAINT "station_embeddings_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_group_members" ADD CONSTRAINT "station_group_members_group_id_station_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."station_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_group_members" ADD CONSTRAINT "station_group_members_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_messages_session_idx" ON "agent_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_sessions_updated_idx" ON "agent_sessions" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "disruptions_status_idx" ON "disruptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "disruptions_line_idx" ON "disruptions" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "disruptions_station_idx" ON "disruptions" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "disruptions_published_idx" ON "disruptions" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "disruptions_source_external_unique" ON "disruptions" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "line_stops_station_idx" ON "line_stops" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "line_stops_line_position_idx" ON "line_stops" USING btree ("line_id","direction","position");--> statement-breakpoint
CREATE UNIQUE INDEX "lines_system_code_unique" ON "lines" USING btree ("system_id","code");--> statement-breakpoint
CREATE INDEX "lines_system_idx" ON "lines" USING btree ("system_id");--> statement-breakpoint
CREATE INDEX "lines_service_class_idx" ON "lines" USING btree ("service_class");--> statement-breakpoint
CREATE UNIQUE INDEX "news_items_url_unique" ON "news_items" USING btree ("url");--> statement-breakpoint
CREATE INDEX "news_items_published_idx" ON "news_items" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "route_plans_created_idx" ON "route_plans" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "social_posts_platform_external_unique" ON "social_posts" USING btree ("platform","external_id");--> statement-breakpoint
CREATE INDEX "social_posts_author_idx" ON "social_posts" USING btree ("author_handle");--> statement-breakpoint
CREATE INDEX "social_posts_published_idx" ON "social_posts" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "station_embeddings_model_idx" ON "station_embeddings" USING btree ("model");--> statement-breakpoint
CREATE INDEX "station_group_members_station_idx" ON "station_group_members" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "station_groups_coordinates_idx" ON "station_groups" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE UNIQUE INDEX "stations_system_name_unique" ON "stations" USING btree ("system_id","name");--> statement-breakpoint
CREATE INDEX "stations_system_idx" ON "stations" USING btree ("system_id");--> statement-breakpoint
CREATE INDEX "stations_coordinates_idx" ON "stations" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "stations_interchange_idx" ON "stations" USING btree ("is_interchange");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS stations_search_trgm_idx ON stations USING gin (search_text gin_trgm_ops);

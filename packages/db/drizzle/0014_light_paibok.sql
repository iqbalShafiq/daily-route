CREATE TABLE "rider_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"origin_key" text NOT NULL,
	"destination_key" text NOT NULL,
	"origin_name" text NOT NULL,
	"destination_name" text NOT NULL,
	"origin_label" text,
	"destination_label" text,
	"line_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"weekday" smallint NOT NULL,
	"minute_of_day" integer NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rider_observations_source_check" CHECK ("rider_observations"."source" in ('plan', 'chat')),
	CONSTRAINT "rider_observations_weekday_check" CHECK ("rider_observations"."weekday" between 0 and 6),
	CONSTRAINT "rider_observations_minute_check" CHECK ("rider_observations"."minute_of_day" between 0 and 1439)
);
--> statement-breakpoint
CREATE TABLE "rider_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_result_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rider_observations" ADD CONSTRAINT "rider_observations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_places" ADD CONSTRAINT "rider_places_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rider_observations_user_created_idx" ON "rider_observations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rider_places_user_label_unique" ON "rider_places" USING btree ("user_id",lower("label"));--> statement-breakpoint
CREATE INDEX "rider_places_user_idx" ON "rider_places" USING btree ("user_id");
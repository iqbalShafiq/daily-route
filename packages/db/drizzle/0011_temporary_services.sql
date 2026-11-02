CREATE TABLE "temporary_services" (
	"id" text PRIMARY KEY NOT NULL,
	"event_key" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"system_id" text NOT NULL,
	"operator" text NOT NULL,
	"mode" text NOT NULL,
	"service_class" text NOT NULL,
	"color" text,
	"directions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"review_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"source" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "temporary_services_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
ALTER TABLE "temporary_services" ADD CONSTRAINT "temporary_services_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "temporary_services_status_idx" ON "temporary_services" USING btree ("status");--> statement-breakpoint
CREATE INDEX "temporary_services_start_idx" ON "temporary_services" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "temporary_services_system_idx" ON "temporary_services" USING btree ("system_id");
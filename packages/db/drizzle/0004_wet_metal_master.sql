CREATE TABLE "monitor_cursors" (
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"system_id" text,
	"account_id" text,
	"since_id" text,
	"page_token" text,
	"newest_id" text,
	"backfill_start" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monitor_cursors_platform_handle_pk" PRIMARY KEY("platform","handle")
);
--> statement-breakpoint
ALTER TABLE "disruptions" ADD COLUMN "event_key" text;--> statement-breakpoint
ALTER TABLE "disruptions" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "disruptions" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "disruptions" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "disruptions" ADD COLUMN "resolved_reason" text;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "classification_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "classification_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "classification_error" text;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "classified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "classification_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "classification_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "classification_error" text;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "classified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "monitor_cursors_polled_idx" ON "monitor_cursors" USING btree ("last_polled_at");--> statement-breakpoint
CREATE INDEX "disruptions_event_idx" ON "disruptions" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "disruptions_last_seen_idx" ON "disruptions" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "news_items_queue_idx" ON "news_items" USING btree ("classification_status","next_attempt_at","published_at");--> statement-breakpoint
CREATE INDEX "social_posts_queue_idx" ON "social_posts" USING btree ("classification_status","next_attempt_at","published_at");--> statement-breakpoint
UPDATE "disruptions" SET "last_seen_at" = "published_at";--> statement-breakpoint
UPDATE "disruptions"
SET "ends_at" = ("metadata" ->> 'until')::timestamptz
WHERE "metadata" ? 'until'
  AND ("metadata" ->> 'until') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T';--> statement-breakpoint
UPDATE "social_posts"
SET "classification_status" = CASE
    WHEN "published_at" >= now() - interval '72 hours' THEN 'pending'
    WHEN "metadata" ->> 'reviewed' = 'true' THEN 'classified'
    ELSE 'skipped'
  END,
  "classification_attempts" = 0,
  "next_attempt_at" = now();--> statement-breakpoint
UPDATE "news_items"
SET "classification_status" = CASE
    WHEN "published_at" >= now() - interval '72 hours' THEN 'pending'
    WHEN "metadata" ->> 'reviewed' = 'true' THEN 'classified'
    ELSE 'skipped'
  END,
  "classification_attempts" = 0,
  "next_attempt_at" = now();

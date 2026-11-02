ALTER TABLE "disruptions" ADD COLUMN "review_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "disruptions" ADD COLUMN "last_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "disruptions" ADD COLUMN "review_state" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "disruptions" ADD COLUMN "duration_assessment" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "disruptions_review_idx" ON "disruptions" USING btree ("review_at");
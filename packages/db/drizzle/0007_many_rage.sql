ALTER TABLE "disruptions" ADD COLUMN "scope" text;--> statement-breakpoint
ALTER TABLE "disruptions" ADD COLUMN "line_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "disruptions" ADD COLUMN "roads" jsonb DEFAULT '[]'::jsonb NOT NULL;
CREATE TABLE "fare_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"rules" jsonb NOT NULL,
	"updated_at" timestamp NOT NULL
);

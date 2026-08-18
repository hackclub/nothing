ALTER TABLE "project" ADD COLUMN "hours" real;--> statement-breakpoint
UPDATE "project" SET "hours" = 0 WHERE "hours" IS NULL;--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "hours" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "slack_id" text;
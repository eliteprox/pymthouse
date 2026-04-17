ALTER TABLE "plans" ADD COLUMN "included_units" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "overage_rate_wei" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "current_period_start" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "current_period_end" text;

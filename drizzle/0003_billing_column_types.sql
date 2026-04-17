ALTER TABLE "plans" ALTER COLUMN "included_units" TYPE bigint USING (
  CASE
    WHEN "included_units" IS NULL THEN NULL
    WHEN trim("included_units"::text) = '' THEN NULL
    ELSE trim("included_units"::text)::bigint
  END
);--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "overage_rate_wei" TYPE bigint USING (
  CASE
    WHEN "overage_rate_wei" IS NULL THEN NULL
    WHEN trim("overage_rate_wei"::text) = '' THEN NULL
    ELSE trim("overage_rate_wei"::text)::bigint
  END
);--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "current_period_start" TYPE timestamptz USING (
  CASE
    WHEN "current_period_start" IS NULL THEN NULL
    WHEN trim("current_period_start"::text) = '' THEN NULL
    ELSE trim("current_period_start"::text)::timestamptz
  END
);--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "current_period_end" TYPE timestamptz USING (
  CASE
    WHEN "current_period_end" IS NULL THEN NULL
    WHEN trim("current_period_end"::text) = '' THEN NULL
    ELSE trim("current_period_end"::text)::timestamptz
  END
);

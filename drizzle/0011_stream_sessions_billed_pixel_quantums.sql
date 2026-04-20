-- Stream sessions: signer_payment_count from usage transactions; drop legacy pixel columns.
-- Squashed: avoids a transient billed_pixel_quantums add/backfill/drop cycle on fresh installs.
ALTER TABLE "stream_sessions" ADD COLUMN "signer_payment_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "stream_sessions" AS ss
SET "signer_payment_count" = t.cnt
FROM (
  SELECT "stream_session_id", COUNT(*)::integer AS cnt
  FROM "transactions"
  WHERE "type" = 'usage' AND "status" = 'confirmed'
  GROUP BY "stream_session_id"
) AS t
WHERE ss.id = t."stream_session_id";--> statement-breakpoint
ALTER TABLE "stream_sessions" DROP COLUMN IF EXISTS "billed_pixel_quantums";--> statement-breakpoint
ALTER TABLE "stream_sessions" DROP COLUMN IF EXISTS "total_pixels";

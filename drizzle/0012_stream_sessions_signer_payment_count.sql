-- Count signer billing events per stream session (no pixel aggregates on this row).
ALTER TABLE "stream_sessions" ADD COLUMN "signer_payment_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "stream_sessions" ss
SET "signer_payment_count" = (
  SELECT COUNT(*)::integer
  FROM "transactions" t
  WHERE t.stream_session_id = ss.id
    AND t.type = 'usage'
    AND t.status = 'confirmed'
);--> statement-breakpoint
ALTER TABLE "stream_sessions" DROP COLUMN IF EXISTS "billed_pixel_quantums";--> statement-breakpoint
ALTER TABLE "stream_sessions" DROP COLUMN IF EXISTS "total_pixels";

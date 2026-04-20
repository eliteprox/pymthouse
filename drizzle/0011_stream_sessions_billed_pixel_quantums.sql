-- Replace per-pixel integer totals (32-bit overflow risk, hot read-modify-write) with
-- ceil-summed 64Ki-pixel quanta, incremented server-side as bigint.
ALTER TABLE "stream_sessions" ADD COLUMN "billed_pixel_quantums" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "stream_sessions" SET "billed_pixel_quantums" = (COALESCE("total_pixels", 0)::bigint + 65535) / 65536;--> statement-breakpoint
ALTER TABLE "stream_sessions" DROP COLUMN "total_pixels";

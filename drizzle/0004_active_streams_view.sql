CREATE INDEX IF NOT EXISTS "transactions_usage_confirmed_stream_session_created_at_idx"
ON "transactions" ("stream_session_id", "created_at")
WHERE
  "type" = 'usage'
  AND "status" = 'confirmed'
  AND "stream_session_id" IS NOT NULL;

CREATE OR REPLACE VIEW "active_stream_ids_by_recent_payment" AS
SELECT DISTINCT "stream_session_id" AS "id"
FROM "transactions"
WHERE
  "type" = 'usage'
  AND "status" = 'confirmed'
  AND "stream_session_id" IS NOT NULL
  AND "created_at"::timestamptz > NOW() - INTERVAL '5 minutes';

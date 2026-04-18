-- Idempotent repair: some databases recorded later journal entries while `developer_apps`
-- still had legacy `billing_pattern` or lacked `m2m_oidc_client_id` (partial apply / restore).
ALTER TABLE "developer_apps" DROP COLUMN IF EXISTS "billing_pattern";--> statement-breakpoint
ALTER TABLE "developer_apps" ADD COLUMN IF NOT EXISTS "m2m_oidc_client_id" text;--> statement-breakpoint
-- No orphan cleanup before the FK: m2m_oidc_client_id is only set from oidc_clients.id
-- in application code; if the constraint was missing due to a partial migration, values
-- should already reference valid rows.
DO $repair$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'developer_apps_m2m_oidc_client_id_oidc_clients_id_fk'
  ) THEN
    ALTER TABLE "developer_apps"
      ADD CONSTRAINT "developer_apps_m2m_oidc_client_id_oidc_clients_id_fk"
      FOREIGN KEY ("m2m_oidc_client_id")
      REFERENCES "public"."oidc_clients"("id")
      ON DELETE NO ACTION
      ON UPDATE NO ACTION;
  END IF;
END
$repair$;

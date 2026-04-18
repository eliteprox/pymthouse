-- Idempotent repair: some databases recorded later journal entries while `developer_apps`
-- still had legacy `billing_pattern` or lacked `m2m_oidc_client_id` (partial apply / restore).
ALTER TABLE "developer_apps" DROP COLUMN IF EXISTS "billing_pattern";--> statement-breakpoint
ALTER TABLE "developer_apps" ADD COLUMN IF NOT EXISTS "m2m_oidc_client_id" text;--> statement-breakpoint
DO $repair$
BEGIN
  -- Clear dangling M2M FK targets so ADD CONSTRAINT cannot fail if oidc_clients rows were removed.
  UPDATE "developer_apps" d
  SET "m2m_oidc_client_id" = NULL
  WHERE d."m2m_oidc_client_id" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."oidc_clients" c
      WHERE c."id" = d."m2m_oidc_client_id"
    );

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

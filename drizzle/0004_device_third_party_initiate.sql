ALTER TABLE "oidc_clients" ADD COLUMN IF NOT EXISTS "device_third_party_initiate_login" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "oidc_clients" SET "device_third_party_initiate_login" = 0 WHERE "device_third_party_initiate_login" IS NULL;

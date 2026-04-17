ALTER TABLE "oidc_clients" ADD COLUMN IF NOT EXISTS "device_third_party_initiate_login" integer DEFAULT 0 NOT NULL;--> statement-breakpoint


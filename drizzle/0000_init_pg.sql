CREATE TABLE "admin_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"created_by" text NOT NULL,
	"used_by" text,
	"expires_at" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "admin_invites_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"key_hash" text NOT NULL,
	"user_id" text,
	"client_id" text NOT NULL,
	"subscription_id" text,
	"label" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text NOT NULL,
	"revoked_at" text,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "app_allowed_domains" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"domain" text NOT NULL,
	"verified" integer DEFAULT 0 NOT NULL,
	"purpose" text DEFAULT 'cors' NOT NULL,
	"verification_token" text,
	"verified_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "app_allowed_domains_app_id_domain_unique" ON "app_allowed_domains" ("app_id","domain");
--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"external_user_id" text NOT NULL,
	"email" text,
	"status" text DEFAULT 'active' NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text,
	"actor_user_id" text,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"correlation_id" text NOT NULL,
	"metadata" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_apps" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"oidc_client_id" text,
	"name" text NOT NULL,
	"subtitle" text,
	"description" text,
	"category" text,
	"logo_light_url" text,
	"logo_dark_url" text,
	"developer_name" text,
	"website_url" text,
	"support_url" text,
	"privacy_policy_url" text,
	"tos_url" text,
	"demo_recording_url" text,
	"links_to_purchases" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"reviewer_notes" text,
	"reviewed_by" text,
	"reviewed_at" text,
	"submitted_at" text,
	"pending_scopes" text,
	"pending_grant_types" text,
	"pending_revision_submitted_at" text,
	"branding_mode" text DEFAULT 'blackLabel' NOT NULL,
	"custom_login_enabled" integer DEFAULT 0 NOT NULL,
	"custom_login_domain" text,
	"custom_domain_verified_at" text,
	"custom_domain_verification_token" text,
	"custom_issuer_enabled" integer DEFAULT 0 NOT NULL,
	"custom_issuer_url" text,
	"branding_primary_color" text,
	"branding_logo_url" text,
	"branding_support_email" text,
	"billing_pattern" text DEFAULT 'app_level' NOT NULL,
	"jwks_uri" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"published_at" text
);
--> statement-breakpoint
CREATE TABLE "end_users" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text,
	"external_user_id" text,
	"name" text,
	"email" text,
	"privy_did" text,
	"wallet_address" text,
	"credit_balance_wei" text DEFAULT '0' NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "end_users_privy_did_unique" UNIQUE("privy_did")
);
--> statement-breakpoint
CREATE TABLE "oidc_auth_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"scopes" text NOT NULL,
	"nonce" text,
	"code_challenge" text,
	"code_challenge_method" text,
	"redirect_uri" text NOT NULL,
	"expires_at" text NOT NULL,
	"consumed_at" text,
	"created_at" text NOT NULL,
	CONSTRAINT "oidc_auth_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "oidc_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_hash" text,
	"display_name" text NOT NULL,
	"redirect_uris" text NOT NULL,
	"allowed_scopes" text DEFAULT 'openid profile email' NOT NULL,
	"grant_types" text DEFAULT 'authorization_code,refresh_token' NOT NULL,
	"token_endpoint_auth_method" text DEFAULT 'none' NOT NULL,
	"post_logout_redirect_uris" text,
	"initiate_login_uri" text,
	"logo_uri" text,
	"policy_uri" text,
	"tos_uri" text,
	"client_uri" text,
	"created_at" text NOT NULL,
	CONSTRAINT "oidc_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oidc_device_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code" text NOT NULL,
	"user_code" text NOT NULL,
	"client_id" text NOT NULL,
	"scopes" text NOT NULL,
	"verification_uri" text NOT NULL,
	"expires_at" text NOT NULL,
	"interval" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"user_id" text,
	"created_at" text NOT NULL,
	CONSTRAINT "oidc_device_codes_device_code_unique" UNIQUE("device_code"),
	CONSTRAINT "oidc_device_codes_user_code_unique" UNIQUE("user_code")
);
--> statement-breakpoint
CREATE TABLE "oidc_payloads" (
	"id" text NOT NULL,
	"model" text NOT NULL,
	"payload" text NOT NULL,
	"expires_at" integer,
	"consumed_at" integer,
	"uid" text,
	"user_code" text,
	"grant_id" text,
	CONSTRAINT "oidc_payloads_id_model_pk" PRIMARY KEY("id","model")
);
--> statement-breakpoint
CREATE TABLE "oidc_refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"scopes" text NOT NULL,
	"expires_at" text NOT NULL,
	"revoked_at" text,
	"created_at" text NOT NULL,
	CONSTRAINT "oidc_refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "oidc_signing_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"kid" text NOT NULL,
	"algorithm" text DEFAULT 'RS256' NOT NULL,
	"public_key_pem" text NOT NULL,
	"private_key_pem" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"rotated_at" text,
	CONSTRAINT "oidc_signing_keys_kid_unique" UNIQUE("kid")
);
--> statement-breakpoint
CREATE TABLE "plan_capability_bundles" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"client_id" text NOT NULL,
	"pipeline" text NOT NULL,
	"model_id" text NOT NULL,
	"sla_target_score" real,
	"sla_target_p95_ms" integer,
	"max_price_per_unit" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'free' NOT NULL,
	"price_amount" text DEFAULT '0' NOT NULL,
	"price_currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_admins" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"end_user_id" text,
	"app_id" text,
	"label" text,
	"token_hash" text NOT NULL,
	"scopes" text DEFAULT 'gateway' NOT NULL,
	"expires_at" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "signer_config" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"client_id" text,
	"name" text DEFAULT 'pymthouse signer' NOT NULL,
	"signer_url" text,
	"signer_api_key" text,
	"eth_address" text,
	"eth_acct_addr" text,
	"network" text DEFAULT 'arbitrum-one-mainnet' NOT NULL,
	"eth_rpc_url" text DEFAULT 'https://arb1.arbitrum.io/rpc' NOT NULL,
	"signer_port" integer DEFAULT 8081 NOT NULL,
	"status" text DEFAULT 'stopped' NOT NULL,
	"deposit_wei" text DEFAULT '0',
	"reserve_wei" text DEFAULT '0',
	"default_cut_percent" real DEFAULT 15 NOT NULL,
	"billing_mode" text DEFAULT 'delegated' NOT NULL,
	"naap_api_key" text,
	"remote_discovery" integer DEFAULT 0 NOT NULL,
	"orch_webhook_url" text,
	"live_ai_cap_report_interval" text,
	"last_started_at" text,
	"last_error" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"end_user_id" text,
	"app_id" text,
	"bearer_token_hash" text,
	"manifest_id" text NOT NULL,
	"orchestrator_address" text,
	"total_pixels" integer DEFAULT 0 NOT NULL,
	"total_fee_wei" text DEFAULT '0' NOT NULL,
	"price_per_unit" text,
	"pixels_per_unit" text,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" text NOT NULL,
	"last_payment_at" text,
	"ended_at" text
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"client_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text NOT NULL,
	"cancelled_at" text
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"end_user_id" text,
	"app_id" text,
	"client_id" text,
	"stream_session_id" text,
	"type" text NOT NULL,
	"amount_wei" text NOT NULL,
	"platform_cut_percent" real,
	"platform_cut_wei" text,
	"tx_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"user_id" text,
	"client_id" text NOT NULL,
	"model_id" text,
	"units" text DEFAULT '0' NOT NULL,
	"fee" text DEFAULT '0' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"name" text,
	"oauth_provider" text NOT NULL,
	"oauth_subject" text NOT NULL,
	"role" text DEFAULT 'developer' NOT NULL,
	"wallet_address" text,
	"privy_did" text,
	"created_at" text NOT NULL,
	CONSTRAINT "users_privy_did_unique" UNIQUE("privy_did")
);
--> statement-breakpoint
ALTER TABLE "admin_invites" ADD CONSTRAINT "admin_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_invites" ADD CONSTRAINT "admin_invites_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_client_id_developer_apps_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."developer_apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_allowed_domains" ADD CONSTRAINT "app_allowed_domains_app_id_developer_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."developer_apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_client_id_developer_apps_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."developer_apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_audit_log" ADD CONSTRAINT "auth_audit_log_client_id_developer_apps_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."developer_apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_apps" ADD CONSTRAINT "developer_apps_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_apps" ADD CONSTRAINT "developer_apps_oidc_client_id_oidc_clients_id_fk" FOREIGN KEY ("oidc_client_id") REFERENCES "public"."oidc_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_apps" ADD CONSTRAINT "developer_apps_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_auth_codes" ADD CONSTRAINT "oidc_auth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_device_codes" ADD CONSTRAINT "oidc_device_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_refresh_tokens" ADD CONSTRAINT "oidc_refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_capability_bundles" ADD CONSTRAINT "plan_capability_bundles_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_capability_bundles" ADD CONSTRAINT "plan_capability_bundles_client_id_developer_apps_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."developer_apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_client_id_developer_apps_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."developer_apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_admins" ADD CONSTRAINT "provider_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_admins" ADD CONSTRAINT "provider_admins_client_id_developer_apps_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."developer_apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_end_user_id_end_users_id_fk" FOREIGN KEY ("end_user_id") REFERENCES "public"."end_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signer_config" ADD CONSTRAINT "signer_config_client_id_developer_apps_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."developer_apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_sessions" ADD CONSTRAINT "stream_sessions_end_user_id_end_users_id_fk" FOREIGN KEY ("end_user_id") REFERENCES "public"."end_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_client_id_developer_apps_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."developer_apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_end_user_id_end_users_id_fk" FOREIGN KEY ("end_user_id") REFERENCES "public"."end_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_client_id_developer_apps_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."developer_apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_stream_session_id_stream_sessions_id_fk" FOREIGN KEY ("stream_session_id") REFERENCES "public"."stream_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_client_id_developer_apps_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."developer_apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_app_users_client_external" ON "app_users" USING btree ("client_id","external_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_end_users_app_external" ON "end_users" USING btree ("app_id","external_user_id") WHERE "end_users"."app_id" IS NOT NULL AND "end_users"."external_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_oidc_payloads_uid" ON "oidc_payloads" USING btree ("uid");--> statement-breakpoint
CREATE INDEX "idx_oidc_payloads_uid_model" ON "oidc_payloads" USING btree ("uid","model");--> statement-breakpoint
CREATE INDEX "idx_oidc_payloads_user_code" ON "oidc_payloads" USING btree ("user_code");--> statement-breakpoint
CREATE INDEX "idx_oidc_payloads_grant_id" ON "oidc_payloads" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "idx_oidc_payloads_expires" ON "oidc_payloads" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_plan_capability_bundles_unique" ON "plan_capability_bundles" USING btree ("plan_id","pipeline","model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_plans_client_name" ON "plans" USING btree ("client_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_provider_admins_user_client" ON "provider_admins" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_usage_records_client_request" ON "usage_records" USING btree ("client_id","request_id");
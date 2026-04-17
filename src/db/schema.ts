import {
  pgTable,
  text,
  integer,
  real,
  bigint,
  timestamp,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Admin/operator/developer accounts (OAuth or wallet login)
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  name: text("name"),
  oauthProvider: text("oauth_provider").notNull(), // google | github | bootstrap | privy-wallet
  oauthSubject: text("oauth_subject").notNull(),
  role: text("role").notNull().default("developer"), // admin | operator | developer
  walletAddress: text("wallet_address"),
  privyDid: text("privy_did").unique(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// Bearer tokens -- can be scoped to an admin user or an end user
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  endUserId: text("end_user_id").references(() => endUsers.id),
  appId: text("app_id"), // developer app this token belongs to (nullable)
  label: text("label"),
  tokenHash: text("token_hash").notNull().unique(),
  scopes: text("scopes").notNull().default("sign:job"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// Single shared go-livepeer remote signer for the clearinghouse (`id === "default"`).
// `client_id` is legacy (per-app signer rows); unused — scale with multiple replicas behind one URL.
export const signerConfig = pgTable("signer_config", {
  id: text("id").primaryKey().default("default"),
  clientId: text("client_id").references(() => developerApps.id),
  name: text("name").notNull().default("pymthouse signer"),
  signerUrl: text("signer_url"),
  signerApiKey: text("signer_api_key"),
  ethAddress: text("eth_address"), // read from go-livepeer /status
  ethAcctAddr: text("eth_acct_addr"), // configured eth account to pass at start
  network: text("network").notNull().default("arbitrum-one-mainnet"),
  ethRpcUrl: text("eth_rpc_url").notNull().default("https://arb1.arbitrum.io/rpc"),
  signerPort: integer("signer_port").notNull().default(8081),
  status: text("status").notNull().default("stopped"), // running | stopped | error
  depositWei: text("deposit_wei").default("0"),
  reserveWei: text("reserve_wei").default("0"),
  defaultCutPercent: real("default_cut_percent").notNull().default(15.0),
  billingMode: text("billing_mode").notNull().default("delegated"), // prepay | delegated
  naapApiKey: text("naap_api_key"),
  remoteDiscovery: integer("remote_discovery").notNull().default(0), // 0=false, 1=true
  orchWebhookUrl: text("orch_webhook_url"), // required when remoteDiscovery
  liveAICapReportInterval: text("live_ai_cap_report_interval"), // e.g. 5m, 10s; required when remoteDiscovery
  lastStartedAt: text("last_started_at"),
  lastError: text("last_error"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// End users -- the actual multi-user entities (Privy wallets, credits, usage)
export const endUsers = pgTable(
  "end_users",
  {
    id: text("id").primaryKey(),
    appId: text("app_id"),
    externalUserId: text("external_user_id"), // platform's user sub claim for token exchange mapping
    name: text("name"),
    email: text("email"),
    privyDid: text("privy_did").unique(),
    walletAddress: text("wallet_address"),
    creditBalanceWei: text("credit_balance_wei").notNull().default("0"),
    isActive: integer("is_active").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex("idx_end_users_app_external")
      .on(t.appId, t.externalUserId)
      .where(sql`${t.appId} IS NOT NULL AND ${t.externalUserId} IS NOT NULL`),
  ],
);

export const streamSessions = pgTable("stream_sessions", {
  id: text("id").primaryKey(),
  endUserId: text("end_user_id").references(() => endUsers.id),
  appId: text("app_id"), // developer app attribution
  bearerTokenHash: text("bearer_token_hash"),
  manifestId: text("manifest_id").notNull(),
  orchestratorAddress: text("orchestrator_address"),
  totalPixels: integer("total_pixels").notNull().default(0),
  totalFeeWei: text("total_fee_wei").notNull().default("0"),
  pricePerUnit: text("price_per_unit"),
  pixelsPerUnit: text("pixels_per_unit"),
  status: text("status").notNull().default("active"),
  startedAt: text("started_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  lastPaymentAt: text("last_payment_at"),
  endedAt: text("ended_at"),
});

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  endUserId: text("end_user_id").references(() => endUsers.id),
  appId: text("app_id"),
  clientId: text("client_id").references(() => developerApps.id),
  streamSessionId: text("stream_session_id").references(() => streamSessions.id),
  type: text("type").notNull(), // prepay_credit | usage | payout | refund
  amountWei: text("amount_wei").notNull(),
  platformCutPercent: real("platform_cut_percent"),
  platformCutWei: text("platform_cut_wei"),
  txHash: text("tx_hash"),
  status: text("status").notNull().default("pending"), // pending | confirmed | failed
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// ============================================
// OIDC Provider Tables
// ============================================

// RS256 signing keys for OIDC id_tokens and access_tokens
export const oidcSigningKeys = pgTable("oidc_signing_keys", {
  id: text("id").primaryKey(),
  kid: text("kid").notNull().unique(), // Key ID for JWKS
  algorithm: text("algorithm").notNull().default("RS256"),
  publicKeyPem: text("public_key_pem").notNull(),
  privateKeyPem: text("private_key_pem").notNull(),
  active: integer("active").notNull().default(1), // 1 = active, 0 = rotated
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  rotatedAt: text("rotated_at"),
});

// OIDC client registrations for developer applications
export const oidcClients = pgTable("oidc_clients", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  clientSecretHash: text("client_secret_hash"), // null for public clients
  displayName: text("display_name").notNull(),
  redirectUris: text("redirect_uris").notNull(), // JSON array of allowed URIs
  allowedScopes: text("allowed_scopes").notNull().default("openid profile email"),
  grantTypes: text("grant_types").notNull().default("authorization_code,refresh_token"), // comma-separated
  tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull().default("none"), // none | client_secret_post | client_secret_basic
  postLogoutRedirectUris: text("post_logout_redirect_uris"), // JSON array
  initiateLoginUri: text("initiate_login_uri"),
  logoUri: text("logo_uri"),
  policyUri: text("policy_uri"),
  tosUri: text("tos_uri"),
  clientUri: text("client_uri"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// ============================================
// Developer App Tables
// ============================================

export const developerApps = pgTable("developer_apps", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  oidcClientId: text("oidc_client_id").references(() => oidcClients.id),
  name: text("name").notNull(),
  subtitle: text("subtitle"), // 30 char max
  description: text("description"),
  category: text("category"),
  logoLightUrl: text("logo_light_url"),
  logoDarkUrl: text("logo_dark_url"),
  developerName: text("developer_name"),
  websiteUrl: text("website_url"),
  supportUrl: text("support_url"),
  privacyPolicyUrl: text("privacy_policy_url"),
  tosUrl: text("tos_url"),
  demoRecordingUrl: text("demo_recording_url"),
  linksToPurchases: integer("links_to_purchases").notNull().default(0),
  status: text("status").notNull().default("draft"), // draft | submitted | in_review | approved | rejected
  reviewerNotes: text("reviewer_notes"),
  reviewedBy: text("reviewed_by").references(() => users.id),
  reviewedAt: text("reviewed_at"),
  submittedAt: text("submitted_at"),
  pendingScopes: text("pending_scopes"),
  pendingGrantTypes: text("pending_grant_types"),
  pendingRevisionSubmittedAt: text("pending_revision_submitted_at"),
  brandingMode: text("branding_mode").notNull().default("blackLabel"), // blackLabel | whiteLabel
  customLoginEnabled: integer("custom_login_enabled").notNull().default(0), // 0=false, 1=true
  customLoginDomain: text("custom_login_domain"), // e.g., login.daydream.live
  customDomainVerifiedAt: text("custom_domain_verified_at"), // ISO timestamp when domain was verified
  customDomainVerificationToken: text("custom_domain_verification_token"), // DNS TXT record value for verification
  customIssuerEnabled: integer("custom_issuer_enabled").notNull().default(0), // 0=false, reserved for future
  customIssuerUrl: text("custom_issuer_url"), // reserved for future per-tenant issuer
  brandingPrimaryColor: text("branding_primary_color"), // hex color e.g., #10b981
  brandingLogoUrl: text("branding_logo_url"), // override logo for hosted login
  brandingSupportEmail: text("branding_support_email"), // custom support email for branded login
  billingPattern: text("billing_pattern").notNull().default("app_level"), // app_level | per_user
  jwksUri: text("jwks_uri"), // Platform's JWKS URL for RFC 8693 token exchange (Pattern B)
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  publishedAt: text("published_at"),
});

// Provider-managed application users for the MVP runtime path.
export const appUsers = pgTable(
  "app_users",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => developerApps.id),
    externalUserId: text("external_user_id").notNull(),
    email: text("email"),
    status: text("status").notNull().default("active"),
    role: text("role").notNull().default("user"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex("idx_app_users_client_external").on(t.clientId, t.externalUserId),
  ],
);

export const providerAdmins = pgTable(
  "provider_admins",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    clientId: text("client_id")
      .notNull()
      .references(() => developerApps.id),
    role: text("role").notNull().default("admin"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex("idx_provider_admins_user_client").on(t.userId, t.clientId)],
);

export const plans = pgTable(
  "plans",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => developerApps.id),
    name: text("name").notNull(),
    type: text("type").notNull().default("free"),
    priceAmount: text("price_amount").notNull().default("0"),
    priceCurrency: text("price_currency").notNull().default("USD"),
    status: text("status").notNull().default("draft"),
    /** Pixel-unit quota included per billing cycle (subscription plans). */
    includedUnits: bigint("included_units", { mode: "bigint" }),
    /** Per-pixel wei for overage (subscription) or base rate (usage plans). */
    overageRateWei: bigint("overage_rate_wei", { mode: "bigint" }),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex("idx_plans_client_name").on(t.clientId, t.name)],
);

export const planCapabilityBundles = pgTable(
  "plan_capability_bundles",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    clientId: text("client_id")
      .notNull()
      .references(() => developerApps.id),
    pipeline: text("pipeline").notNull(),
    modelId: text("model_id").notNull(),
    slaTargetScore: real("sla_target_score"),
    slaTargetP95Ms: integer("sla_target_p95_ms"),
    maxPricePerUnit: text("max_price_per_unit"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex("idx_plan_capability_bundles_unique").on(
      t.planId,
      t.pipeline,
      t.modelId,
    ),
  ],
);

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  clientId: text("client_id")
    .notNull()
    .references(() => developerApps.id),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id),
  status: text("status").notNull().default("active"),
  currentPeriodStart: timestamp("current_period_start", {
    withTimezone: true,
    mode: "string",
  }),
  currentPeriodEnd: timestamp("current_period_end", {
    withTimezone: true,
    mode: "string",
  }),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  cancelledAt: text("cancelled_at"),
});

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  keyHash: text("key_hash").notNull().unique(),
  userId: text("user_id").references(() => users.id),
  clientId: text("client_id")
    .notNull()
    .references(() => developerApps.id),
  subscriptionId: text("subscription_id").references(() => subscriptions.id),
  label: text("label"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  revokedAt: text("revoked_at"),
});

export const usageRecords = pgTable(
  "usage_records",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    userId: text("user_id"),
    clientId: text("client_id")
      .notNull()
      .references(() => developerApps.id),
    modelId: text("model_id"),
    units: text("units").notNull().default("0"),
    fee: text("fee").notNull().default("0"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex("idx_usage_records_client_request").on(t.clientId, t.requestId),
  ],
);

export const authAuditLog = pgTable("auth_audit_log", {
  id: text("id").primaryKey(),
  clientId: text("client_id").references(() => developerApps.id),
  actorUserId: text("actor_user_id"),
  action: text("action").notNull(),
  status: text("status").notNull(),
  correlationId: text("correlation_id").notNull(),
  metadata: text("metadata"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const adminInvites = pgTable("admin_invites", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  usedBy: text("used_by").references(() => users.id),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const appAllowedDomains = pgTable("app_allowed_domains", {
  id: text("id").primaryKey(),
  appId: text("app_id")
    .notNull()
    .references(() => developerApps.id),
  domain: text("domain").notNull(),
  verified: integer("verified").notNull().default(0),
  purpose: text("purpose").notNull().default("cors"), // cors | customLogin
  verificationToken: text("verification_token"), // DNS TXT record value for verification
  verifiedAt: text("verified_at"), // ISO timestamp when domain was verified
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (table) => [
  uniqueIndex("app_allowed_domains_app_id_domain_unique").on(table.appId, table.domain),
]);

/** node-oidc-provider adapter storage (JSON payloads). */
export const oidcPayloads = pgTable(
  "oidc_payloads",
  {
    id: text("id").notNull(),
    model: text("model").notNull(),
    payload: text("payload").notNull(),
    expiresAt: integer("expires_at"),
    consumedAt: integer("consumed_at"),
    uid: text("uid"),
    userCode: text("user_code"),
    grantId: text("grant_id"),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.model] }),
    index("idx_oidc_payloads_uid").on(t.uid),
    index("idx_oidc_payloads_uid_model").on(t.uid, t.model),
    index("idx_oidc_payloads_user_code").on(t.userCode),
    index("idx_oidc_payloads_grant_id").on(t.grantId),
    index("idx_oidc_payloads_expires").on(t.expiresAt),
  ],
);

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type SignerConfig = typeof signerConfig.$inferSelect;
export type EndUser = typeof endUsers.$inferSelect;
export type NewEndUser = typeof endUsers.$inferInsert;
export type AppUser = typeof appUsers.$inferSelect;
export type NewAppUser = typeof appUsers.$inferInsert;
export type StreamSession = typeof streamSessions.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type OidcSigningKey = typeof oidcSigningKeys.$inferSelect;
export type OidcClient = typeof oidcClients.$inferSelect;
export type DeveloperApp = typeof developerApps.$inferSelect;
export type NewDeveloperApp = typeof developerApps.$inferInsert;
export type AdminInvite = typeof adminInvites.$inferSelect;
export type AppAllowedDomain = typeof appAllowedDomains.$inferSelect;
export type ProviderAdmin = typeof providerAdmins.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type PlanCapabilityBundle = typeof planCapabilityBundles.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type AuthAuditLog = typeof authAuditLog.$inferSelect;

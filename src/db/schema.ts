import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// Admin/operator accounts (OAuth login)
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  oauthProvider: text("oauth_provider").notNull(), // google | github | bootstrap
  oauthSubject: text("oauth_subject").notNull(),
  role: text("role").notNull().default("operator"), // admin | operator
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// Bearer tokens -- can be scoped to an admin user or an end user
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id), // admin who created this token
  endUserId: text("end_user_id").references(() => endUsers.id), // end user this token is scoped to (nullable)
  label: text("label"), // human-readable label for the token
  tokenHash: text("token_hash").notNull().unique(), // SHA-256 of bearer token
  scopes: text("scopes").notNull().default("gateway"), // admin | gateway | read
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// Singleton: the platform's go-livepeer remote signer
export const signerConfig = sqliteTable("signer_config", {
  id: text("id").primaryKey().default("default"),
  name: text("name").notNull().default("pymthouse signer"),
  ethAddress: text("eth_address"), // read from go-livepeer /status
  ethAcctAddr: text("eth_acct_addr"), // configured eth account to pass at start
  network: text("network").notNull().default("arbitrum-one-mainnet"),
  ethRpcUrl: text("eth_rpc_url").notNull().default("https://arb1.arbitrum.io/rpc"),
  signerPort: integer("signer_port").notNull().default(8935),
  status: text("status").notNull().default("stopped"), // running | stopped | error
  depositWei: text("deposit_wei").default("0"),
  reserveWei: text("reserve_wei").default("0"),
  defaultCutPercent: real("default_cut_percent").notNull().default(15.0),
  billingMode: text("billing_mode").notNull().default("delegated"), // prepay | delegated
  naapApiKey: text("naap_api_key"),
  lastStartedAt: text("last_started_at"),
  lastError: text("last_error"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// End users -- the actual multi-user entities (Privy wallets, credits, usage)
export const endUsers = sqliteTable("end_users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email"),
  privyDid: text("privy_did").unique(),
  walletAddress: text("wallet_address"),
  creditBalanceWei: text("credit_balance_wei").notNull().default("0"),
  isActive: integer("is_active").notNull().default(1), // 0 = suspended
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const streamSessions = sqliteTable("stream_sessions", {
  id: text("id").primaryKey(),
  endUserId: text("end_user_id").references(() => endUsers.id),
  bearerTokenHash: text("bearer_token_hash"),
  manifestId: text("manifest_id").notNull(),
  orchestratorAddress: text("orchestrator_address"),
  totalPixels: integer("total_pixels").notNull().default(0),
  totalFeeWei: text("total_fee_wei").notNull().default("0"),
  pricePerUnit: text("price_per_unit"),
  pixelsPerUnit: text("pixels_per_unit"),
  status: text("status").notNull().default("active"), // active | ended | error
  startedAt: text("started_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  lastPaymentAt: text("last_payment_at"),
  endedAt: text("ended_at"),
});

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  endUserId: text("end_user_id").references(() => endUsers.id),
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
export const oidcSigningKeys = sqliteTable("oidc_signing_keys", {
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

// OIDC client registrations (naap, future services)
export const oidcClients = sqliteTable("oidc_clients", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  clientSecretHash: text("client_secret_hash"), // null for public clients
  displayName: text("display_name").notNull(),
  redirectUris: text("redirect_uris").notNull(), // JSON array of allowed URIs
  allowedScopes: text("allowed_scopes").notNull().default("openid profile email"),
  grantTypes: text("grant_types").notNull().default("authorization_code,refresh_token"), // comma-separated
  tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull().default("none"), // none | client_secret_post | client_secret_basic
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// Authorization codes (short-lived, one-time use)
export const oidcAuthCodes = sqliteTable("oidc_auth_codes", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  clientId: text("client_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id),
  scopes: text("scopes").notNull(),
  nonce: text("nonce"),
  codeChallenge: text("code_challenge"),
  codeChallengeMethod: text("code_challenge_method"), // S256 | plain
  redirectUri: text("redirect_uri").notNull(),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// Refresh tokens for token renewal
export const oidcRefreshTokens = sqliteTable("oidc_refresh_tokens", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  clientId: text("client_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id),
  scopes: text("scopes").notNull(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type SignerConfig = typeof signerConfig.$inferSelect;
export type EndUser = typeof endUsers.$inferSelect;
export type NewEndUser = typeof endUsers.$inferInsert;
export type StreamSession = typeof streamSessions.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type OidcSigningKey = typeof oidcSigningKeys.$inferSelect;
export type OidcClient = typeof oidcClients.$inferSelect;
export type OidcAuthCode = typeof oidcAuthCodes.$inferSelect;
export type OidcRefreshToken = typeof oidcRefreshTokens.$inferSelect;

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

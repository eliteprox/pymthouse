import type { Database } from "better-sqlite3";

/**
 * Run migrations -- create tables + seed singleton signer config.
 */
export function runMigrations(sqlite: Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      oauth_provider TEXT NOT NULL,
      oauth_subject TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operator',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS end_users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      privy_did TEXT UNIQUE,
      wallet_address TEXT,
      credit_balance_wei TEXT NOT NULL DEFAULT '0',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      end_user_id TEXT REFERENCES end_users(id),
      label TEXT,
      token_hash TEXT NOT NULL UNIQUE,
      scopes TEXT NOT NULL DEFAULT 'gateway',
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS signer_config (
      id TEXT PRIMARY KEY DEFAULT 'default',
      name TEXT NOT NULL DEFAULT 'pymthouse signer',
      eth_address TEXT,
      network TEXT NOT NULL DEFAULT 'arbitrum-one-mainnet',
      eth_rpc_url TEXT NOT NULL DEFAULT 'https://arb1.arbitrum.io/rpc',
      signer_port INTEGER NOT NULL DEFAULT 8935,
      status TEXT NOT NULL DEFAULT 'stopped',
      deposit_wei TEXT DEFAULT '0',
      reserve_wei TEXT DEFAULT '0',
      default_cut_percent REAL NOT NULL DEFAULT 15.0,
      billing_mode TEXT NOT NULL DEFAULT 'delegated',
      naap_api_key TEXT,
      last_started_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stream_sessions (
      id TEXT PRIMARY KEY,
      end_user_id TEXT REFERENCES end_users(id),
      bearer_token_hash TEXT,
      manifest_id TEXT NOT NULL,
      orchestrator_address TEXT,
      total_pixels INTEGER NOT NULL DEFAULT 0,
      total_fee_wei TEXT NOT NULL DEFAULT '0',
      price_per_unit TEXT,
      pixels_per_unit TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT NOT NULL,
      last_payment_at TEXT,
      ended_at TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      end_user_id TEXT REFERENCES end_users(id),
      stream_session_id TEXT REFERENCES stream_sessions(id),
      type TEXT NOT NULL,
      amount_wei TEXT NOT NULL,
      platform_cut_percent REAL,
      platform_cut_wei TEXT,
      tx_hash TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_end_user_id ON sessions(end_user_id);
    CREATE INDEX IF NOT EXISTS idx_end_users_privy_did ON end_users(privy_did);
    CREATE INDEX IF NOT EXISTS idx_stream_sessions_manifest_id ON stream_sessions(manifest_id);
    CREATE INDEX IF NOT EXISTS idx_stream_sessions_end_user_id ON stream_sessions(end_user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_end_user_id ON transactions(end_user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_stream_session_id ON transactions(stream_session_id);

    -- OIDC Provider tables
    CREATE TABLE IF NOT EXISTS oidc_signing_keys (
      id TEXT PRIMARY KEY,
      kid TEXT NOT NULL UNIQUE,
      algorithm TEXT NOT NULL DEFAULT 'RS256',
      public_key_pem TEXT NOT NULL,
      private_key_pem TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      rotated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS oidc_clients (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL UNIQUE,
      client_secret_hash TEXT,
      display_name TEXT NOT NULL,
      redirect_uris TEXT NOT NULL,
      allowed_scopes TEXT NOT NULL DEFAULT 'openid profile email',
      grant_types TEXT NOT NULL DEFAULT 'authorization_code,refresh_token',
      token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oidc_auth_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      client_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      scopes TEXT NOT NULL,
      nonce TEXT,
      code_challenge TEXT,
      code_challenge_method TEXT,
      redirect_uri TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oidc_refresh_tokens (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      client_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      scopes TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_oidc_signing_keys_kid ON oidc_signing_keys(kid);
    CREATE INDEX IF NOT EXISTS idx_oidc_clients_client_id ON oidc_clients(client_id);
    CREATE INDEX IF NOT EXISTS idx_oidc_auth_codes_code ON oidc_auth_codes(code);
    CREATE INDEX IF NOT EXISTS idx_oidc_refresh_tokens_token_hash ON oidc_refresh_tokens(token_hash);

    -- Developer App tables
    CREATE TABLE IF NOT EXISTS developer_apps (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      oidc_client_id TEXT REFERENCES oidc_clients(id),
      name TEXT NOT NULL,
      subtitle TEXT,
      description TEXT,
      category TEXT,
      logo_light_url TEXT,
      logo_dark_url TEXT,
      developer_name TEXT,
      website_url TEXT,
      support_url TEXT,
      privacy_policy_url TEXT,
      tos_url TEXT,
      demo_recording_url TEXT,
      links_to_purchases INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      reviewer_notes TEXT,
      reviewed_by TEXT REFERENCES users(id),
      reviewed_at TEXT,
      submitted_at TEXT,
      pending_scopes TEXT,
      pending_grant_types TEXT,
      pending_revision_submitted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_allowed_domains (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL REFERENCES developer_apps(id),
      domain TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_developer_apps_owner_id ON developer_apps(owner_id);
    CREATE INDEX IF NOT EXISTS idx_developer_apps_status ON developer_apps(status);
    CREATE INDEX IF NOT EXISTS idx_app_allowed_domains_app_id ON app_allowed_domains(app_id);
  `);

  // Backfill newer columns for existing databases (ALTER TABLE is idempotent via try/catch).
  const backfills = [
    "ALTER TABLE signer_config ADD COLUMN eth_acct_addr TEXT;",
    "ALTER TABLE signer_config ADD COLUMN remote_discovery INTEGER DEFAULT 0;",
    "ALTER TABLE signer_config ADD COLUMN orch_webhook_url TEXT;",
    "ALTER TABLE signer_config ADD COLUMN live_ai_cap_report_interval TEXT;",
    "ALTER TABLE sessions ADD COLUMN app_id TEXT;",
    "ALTER TABLE end_users ADD COLUMN app_id TEXT;",
    "ALTER TABLE stream_sessions ADD COLUMN app_id TEXT;",
    "ALTER TABLE developer_apps ADD COLUMN pending_scopes TEXT;",
    "ALTER TABLE developer_apps ADD COLUMN pending_grant_types TEXT;",
    "ALTER TABLE developer_apps ADD COLUMN pending_revision_submitted_at TEXT;",
  ];
  for (const sql of backfills) {
    try { sqlite.exec(sql); } catch {}
  }

  // Seed singleton signer config if it doesn't exist
  const existing = sqlite
    .prepare("SELECT id FROM signer_config WHERE id = 'default'")
    .get();

  if (!existing) {
    sqlite
      .prepare(
        `INSERT INTO signer_config (id, name, network, eth_rpc_url, signer_port, status, default_cut_percent, billing_mode, created_at)
         VALUES ('default', 'pymthouse signer', 'arbitrum-one-mainnet', 'https://arb1.arbitrum.io/rpc', 8935, 'stopped', 15.0, 'delegated', ?)`
      )
      .run(new Date().toISOString());
  }
}

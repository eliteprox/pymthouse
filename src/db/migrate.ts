import { sqlite } from "./index";

/**
 * Run migrations -- create tables + seed singleton signer config.
 */
export function runMigrations() {
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
  `);

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

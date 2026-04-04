import type { Database } from "better-sqlite3";

/**
 * Run migrations -- create tables + seed singleton signer config.
 */
export function runMigrations(sqlite: Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
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
      signer_port INTEGER NOT NULL DEFAULT 8081,
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

    -- Device Authorization Flow (RFC 8628)
    CREATE TABLE IF NOT EXISTS oidc_device_codes (
      id TEXT PRIMARY KEY,
      device_code TEXT NOT NULL UNIQUE,
      user_code TEXT NOT NULL UNIQUE,
      client_id TEXT NOT NULL,
      scopes TEXT NOT NULL,
      verification_uri TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      interval INTEGER NOT NULL DEFAULT 5,
      status TEXT NOT NULL DEFAULT 'pending',
      user_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_oidc_device_codes_device_code ON oidc_device_codes(device_code);
    CREATE INDEX IF NOT EXISTS idx_oidc_device_codes_user_code ON oidc_device_codes(user_code);

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

    CREATE TABLE IF NOT EXISTS admin_invites (
      id TEXT PRIMARY KEY NOT NULL,
      code TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      used_by TEXT REFERENCES users(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS admin_invites_code_unique ON admin_invites(code);
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
    "ALTER TABLE oidc_clients ADD COLUMN post_logout_redirect_uris TEXT;",
    "ALTER TABLE oidc_clients ADD COLUMN initiate_login_uri TEXT;",
    "ALTER TABLE oidc_clients ADD COLUMN logo_uri TEXT;",
    "ALTER TABLE oidc_clients ADD COLUMN policy_uri TEXT;",
    "ALTER TABLE oidc_clients ADD COLUMN tos_uri TEXT;",
    "ALTER TABLE oidc_clients ADD COLUMN client_uri TEXT;",
    "ALTER TABLE users ADD COLUMN wallet_address TEXT;",
    "ALTER TABLE users ADD COLUMN privy_did TEXT;",
    // White-label identity hosting columns for developer_apps
    "ALTER TABLE developer_apps ADD COLUMN branding_mode TEXT NOT NULL DEFAULT 'blackLabel';",
    "ALTER TABLE developer_apps ADD COLUMN custom_login_enabled INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE developer_apps ADD COLUMN custom_login_domain TEXT;",
    "ALTER TABLE developer_apps ADD COLUMN custom_domain_verified_at TEXT;",
    "ALTER TABLE developer_apps ADD COLUMN custom_domain_verification_token TEXT;",
    "ALTER TABLE developer_apps ADD COLUMN custom_issuer_enabled INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE developer_apps ADD COLUMN custom_issuer_url TEXT;",
    "ALTER TABLE developer_apps ADD COLUMN branding_primary_color TEXT;",
    "ALTER TABLE developer_apps ADD COLUMN branding_logo_url TEXT;",
    "ALTER TABLE developer_apps ADD COLUMN branding_support_email TEXT;",
    // Enhanced domain tracking for app_allowed_domains
    "ALTER TABLE app_allowed_domains ADD COLUMN purpose TEXT NOT NULL DEFAULT 'cors';",
    "ALTER TABLE app_allowed_domains ADD COLUMN verification_token TEXT;",
    "ALTER TABLE app_allowed_domains ADD COLUMN verified_at TEXT;",
  ];

  // Unique index for privy_did (idempotent)
  try { sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_privy_did_unique ON users(privy_did);"); } catch {}
  for (const sql of backfills) {
    try { sqlite.exec(sql); } catch {}
  }

  // Repair accidental FK references to _users_old from prior migration attempts.
  // We must rebuild affected tables because this SQLite build blocks sqlite_master edits.
  try {
    const brokenRefs = sqlite
      .prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND sql LIKE '%_users_old%'")
      .get() as { count: number };

    if (brokenRefs.count > 0) {
      sqlite.exec(`
        PRAGMA foreign_keys=OFF;
        BEGIN TRANSACTION;

        ALTER TABLE sessions RENAME TO _sessions_old;
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id),
          end_user_id TEXT REFERENCES end_users(id),
          label TEXT,
          token_hash TEXT NOT NULL UNIQUE,
          scopes TEXT NOT NULL DEFAULT 'gateway',
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          app_id TEXT
        );
        INSERT INTO sessions (id, user_id, end_user_id, label, token_hash, scopes, expires_at, created_at, app_id)
        SELECT id, user_id, end_user_id, label, token_hash, scopes, expires_at, created_at, app_id FROM _sessions_old;
        DROP TABLE _sessions_old;

        ALTER TABLE oidc_auth_codes RENAME TO _oidc_auth_codes_old;
        CREATE TABLE oidc_auth_codes (
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
        INSERT INTO oidc_auth_codes (id, code, client_id, user_id, scopes, nonce, code_challenge, code_challenge_method, redirect_uri, expires_at, consumed_at, created_at)
        SELECT id, code, client_id, user_id, scopes, nonce, code_challenge, code_challenge_method, redirect_uri, expires_at, consumed_at, created_at FROM _oidc_auth_codes_old;
        DROP TABLE _oidc_auth_codes_old;

        ALTER TABLE oidc_refresh_tokens RENAME TO _oidc_refresh_tokens_old;
        CREATE TABLE oidc_refresh_tokens (
          id TEXT PRIMARY KEY,
          token_hash TEXT NOT NULL UNIQUE,
          client_id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          scopes TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          revoked_at TEXT,
          created_at TEXT NOT NULL
        );
        INSERT INTO oidc_refresh_tokens (id, token_hash, client_id, user_id, scopes, expires_at, revoked_at, created_at)
        SELECT id, token_hash, client_id, user_id, scopes, expires_at, revoked_at, created_at FROM _oidc_refresh_tokens_old;
        DROP TABLE _oidc_refresh_tokens_old;

        ALTER TABLE oidc_device_codes RENAME TO _oidc_device_codes_old;
        CREATE TABLE oidc_device_codes (
          id TEXT PRIMARY KEY,
          device_code TEXT NOT NULL UNIQUE,
          user_code TEXT NOT NULL UNIQUE,
          client_id TEXT NOT NULL,
          scopes TEXT NOT NULL,
          verification_uri TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          interval INTEGER NOT NULL DEFAULT 5,
          status TEXT NOT NULL DEFAULT 'pending',
          user_id TEXT REFERENCES users(id),
          created_at TEXT NOT NULL
        );
        INSERT INTO oidc_device_codes (id, device_code, user_code, client_id, scopes, verification_uri, expires_at, interval, status, user_id, created_at)
        SELECT id, device_code, user_code, client_id, scopes, verification_uri, expires_at, interval, status, user_id, created_at FROM _oidc_device_codes_old;
        DROP TABLE _oidc_device_codes_old;

        ALTER TABLE developer_apps RENAME TO _developer_apps_old;
        CREATE TABLE developer_apps (
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
        INSERT INTO developer_apps (id, owner_id, oidc_client_id, name, subtitle, description, category, logo_light_url, logo_dark_url, developer_name, website_url, support_url, privacy_policy_url, tos_url, demo_recording_url, links_to_purchases, status, reviewer_notes, reviewed_by, reviewed_at, submitted_at, pending_scopes, pending_grant_types, pending_revision_submitted_at, created_at, updated_at)
        SELECT id, owner_id, oidc_client_id, name, subtitle, description, category, logo_light_url, logo_dark_url, developer_name, website_url, support_url, privacy_policy_url, tos_url, demo_recording_url, links_to_purchases, status, reviewer_notes, reviewed_by, reviewed_at, submitted_at, pending_scopes, pending_grant_types, pending_revision_submitted_at, created_at, updated_at FROM _developer_apps_old;
        DROP TABLE _developer_apps_old;

        ALTER TABLE admin_invites RENAME TO _admin_invites_old;
        CREATE TABLE admin_invites (
          id TEXT PRIMARY KEY NOT NULL,
          code TEXT NOT NULL,
          created_by TEXT NOT NULL REFERENCES users(id),
          used_by TEXT REFERENCES users(id),
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        );
        INSERT INTO admin_invites (id, code, created_by, used_by, expires_at, created_at)
        SELECT id, code, created_by, used_by, expires_at, created_at FROM _admin_invites_old;
        DROP TABLE _admin_invites_old;

        COMMIT;
        PRAGMA foreign_keys=ON;
      `);

      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_end_user_id ON sessions(end_user_id);
        CREATE INDEX IF NOT EXISTS idx_oidc_auth_codes_code ON oidc_auth_codes(code);
        CREATE INDEX IF NOT EXISTS idx_oidc_refresh_tokens_token_hash ON oidc_refresh_tokens(token_hash);
        CREATE INDEX IF NOT EXISTS idx_oidc_device_codes_device_code ON oidc_device_codes(device_code);
        CREATE INDEX IF NOT EXISTS idx_oidc_device_codes_user_code ON oidc_device_codes(user_code);
        CREATE INDEX IF NOT EXISTS idx_developer_apps_owner_id ON developer_apps(owner_id);
        CREATE INDEX IF NOT EXISTS idx_developer_apps_status ON developer_apps(status);
        CREATE UNIQUE INDEX IF NOT EXISTS admin_invites_code_unique ON admin_invites(code);
      `);
    }
  } catch {}

  // Repair app_allowed_domains FK if it references _developer_apps_old.
  try {
    const brokenDomainRef = sqlite
      .prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='app_allowed_domains' AND sql LIKE '%_developer_apps_old%'")
      .get() as { count: number };

    if (brokenDomainRef.count > 0) {
      sqlite.exec(`
        PRAGMA foreign_keys=OFF;
        BEGIN TRANSACTION;

        ALTER TABLE app_allowed_domains RENAME TO _app_allowed_domains_old;
        CREATE TABLE app_allowed_domains (
          id TEXT PRIMARY KEY,
          app_id TEXT NOT NULL REFERENCES developer_apps(id),
          domain TEXT NOT NULL,
          verified INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
        INSERT INTO app_allowed_domains (id, app_id, domain, verified, created_at)
        SELECT id, app_id, domain, verified, created_at FROM _app_allowed_domains_old;
        DROP TABLE _app_allowed_domains_old;

        COMMIT;
        PRAGMA foreign_keys=ON;
      `);

      sqlite.exec("CREATE INDEX IF NOT EXISTS idx_app_allowed_domains_app_id ON app_allowed_domains(app_id);");
    }
  } catch {}

  // Backfill OIDC scopes for legacy device-flow clients created before
  // gateway/offline_access were added to the SDK flow defaults.
  sqlite.exec(`
    UPDATE oidc_clients
    SET allowed_scopes = trim(allowed_scopes || ' gateway offline_access')
    WHERE grant_types LIKE '%urn:ietf:params:oauth:grant-type:device_code%'
      AND (allowed_scopes NOT LIKE '%gateway%' OR allowed_scopes NOT LIKE '%offline_access%');
  `);

  // Add billing pattern + JWKS URI to developer_apps, appId to transactions,
  // externalUserId to end_users.
  try {
    const hasBillingPattern = sqlite
      .prepare("SELECT COUNT(*) as count FROM pragma_table_info('developer_apps') WHERE name='billing_pattern'")
      .get() as { count: number };
    if (hasBillingPattern.count === 0) {
      sqlite.exec("ALTER TABLE developer_apps ADD COLUMN billing_pattern TEXT NOT NULL DEFAULT 'app_level';");
    }
  } catch {}

  try {
    const hasJwksUri = sqlite
      .prepare("SELECT COUNT(*) as count FROM pragma_table_info('developer_apps') WHERE name='jwks_uri'")
      .get() as { count: number };
    if (hasJwksUri.count === 0) {
      sqlite.exec("ALTER TABLE developer_apps ADD COLUMN jwks_uri TEXT;");
    }
  } catch {}

  try {
    const hasTxAppId = sqlite
      .prepare("SELECT COUNT(*) as count FROM pragma_table_info('transactions') WHERE name='app_id'")
      .get() as { count: number };
    if (hasTxAppId.count === 0) {
      sqlite.exec("ALTER TABLE transactions ADD COLUMN app_id TEXT;");
      sqlite.exec("CREATE INDEX IF NOT EXISTS idx_transactions_app_id ON transactions(app_id);");
    }
  } catch {}

  try {
    const hasExternalUserId = sqlite
      .prepare("SELECT COUNT(*) as count FROM pragma_table_info('end_users') WHERE name='external_user_id'")
      .get() as { count: number };
    if (hasExternalUserId.count === 0) {
      sqlite.exec("ALTER TABLE end_users ADD COLUMN external_user_id TEXT;");
      sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_end_users_app_external ON end_users(app_id, external_user_id) WHERE app_id IS NOT NULL AND external_user_id IS NOT NULL;");
    }
  } catch {}

  // Seed singleton signer config if it doesn't exist
  const existing = sqlite
    .prepare("SELECT id FROM signer_config WHERE id = 'default'")
    .get();

  if (!existing) {
    sqlite
      .prepare(
        `INSERT INTO signer_config (id, name, network, eth_rpc_url, signer_port, status, default_cut_percent, billing_mode, created_at)
         VALUES ('default', 'pymthouse signer', 'arbitrum-one-mainnet', 'https://arb1.arbitrum.io/rpc', 8081, 'stopped', 15.0, 'delegated', ?)`
      )
      .run(new Date().toISOString());
  }
}

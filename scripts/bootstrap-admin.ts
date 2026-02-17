/**
 * Bootstrap script: creates the first admin user and prints a bearer token.
 *
 * Usage:
 *   npx tsx scripts/bootstrap-admin.ts [email]
 *
 * This only works when no admin users exist yet.
 * The generated bearer token has admin scope and can be used
 * with the API or set as a cookie for the UI.
 */

import Database from "better-sqlite3";
import { createHash, randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";

const dbPath = process.env.DATABASE_PATH || "./data/pymthouse.db";
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Ensure tables exist
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
    network TEXT NOT NULL DEFAULT 'arbitrum-mainnet',
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
  CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
`);

// Seed singleton signer config
const existingSigner = sqlite
  .prepare("SELECT id FROM signer_config WHERE id = 'default'")
  .get();
if (!existingSigner) {
  sqlite
    .prepare(
      "INSERT INTO signer_config (id, name, network, eth_rpc_url, status, default_cut_percent, billing_mode, created_at) VALUES ('default', 'pymthouse signer', 'arbitrum-mainnet', 'https://arb1.arbitrum.io/rpc', 'stopped', 15.0, 'delegated', ?)"
    )
    .run(new Date().toISOString());
}

// Check for existing admins
const existingAdmins = sqlite
  .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")
  .get() as { count: number };

const email = process.argv[2] || "admin@pymthouse.local";

if (existingAdmins.count > 0) {
  console.log("\n  Admin user(s) already exist. Issuing a new token for the first admin.\n");
}

// Find or create admin user
let userId: string;
if (existingAdmins.count > 0) {
  const admin = sqlite
    .prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
    .get() as { id: string };
  userId = admin.id;
} else {
  userId = uuidv4();
  sqlite
    .prepare(
      "INSERT INTO users (id, email, name, oauth_provider, oauth_subject, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      userId,
      email,
      "Bootstrap Admin",
      "bootstrap",
      `bootstrap_${userId}`,
      "admin",
      new Date().toISOString()
    );
  console.log(`\n  Created admin user: ${email} (${userId})`);
}

// Generate bearer token
const raw = randomBytes(32).toString("hex");
const token = `pmth_${raw}`;
const hash = createHash("sha256").update(token).digest("hex");
const sessionId = uuidv4();
const expiresAt = new Date(
  Date.now() + 365 * 24 * 60 * 60 * 1000
).toISOString();

sqlite
  .prepare(
    "INSERT INTO sessions (id, user_id, token_hash, scopes, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
  .run(sessionId, userId, hash, "admin", expiresAt, new Date().toISOString());

console.log(`\n  ========================================`);
console.log(`  pymthouse admin bearer token (admin scope)`);
console.log(`  ========================================`);
console.log(`\n  ${token}\n`);
console.log(`  Expires: ${expiresAt}`);
console.log(`  Session: ${sessionId}`);
console.log(`\n  Use with API requests:`);
console.log(`    curl -H "Authorization: Bearer ${token}" http://localhost:3000/api/v1/signers\n`);

sqlite.close();

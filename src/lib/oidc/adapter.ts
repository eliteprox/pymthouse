/**
 * SQLite adapter for node-oidc-provider.
 *
 * Uses the existing better-sqlite3 connection. Stores all provider models
 * (Grant, Session, AccessToken, AuthorizationCode, RefreshToken, DeviceCode,
 * Interaction, Client, etc.) in a single `oidc_payloads` table as JSON blobs
 * with secondary lookup columns for uid, userCode, and grantId.
 */

import type { Adapter, AdapterPayload } from "oidc-provider";
import { sqlite } from "@/db/index";

// Ensure the adapter table exists (idempotent).
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS oidc_payloads (
    id TEXT NOT NULL,
    model TEXT NOT NULL,
    payload TEXT NOT NULL,
    expires_at INTEGER,
    consumed_at INTEGER,
    uid TEXT,
    user_code TEXT,
    grant_id TEXT,
    PRIMARY KEY (id, model)
  );

  CREATE INDEX IF NOT EXISTS idx_oidc_payloads_uid ON oidc_payloads(uid) WHERE uid IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_oidc_payloads_uid_model ON oidc_payloads(uid, model) WHERE uid IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_oidc_payloads_user_code ON oidc_payloads(user_code) WHERE user_code IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_oidc_payloads_grant_id ON oidc_payloads(grant_id) WHERE grant_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_oidc_payloads_expires ON oidc_payloads(expires_at) WHERE expires_at IS NOT NULL;
`);

// Prepared statements for performance
const stmts = {
  upsert: sqlite.prepare(`
    INSERT INTO oidc_payloads (id, model, payload, expires_at, uid, user_code, grant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id, model) DO UPDATE SET
      payload = excluded.payload,
      expires_at = excluded.expires_at,
      uid = excluded.uid,
      user_code = excluded.user_code,
      grant_id = excluded.grant_id
  `),
  find: sqlite.prepare(`
    SELECT payload, consumed_at FROM oidc_payloads
    WHERE id = ? AND model = ?
  `),
  findByUid: sqlite.prepare(`
    SELECT payload, consumed_at FROM oidc_payloads
    WHERE uid = ? AND model = ?
  `),
  findByUserCode: sqlite.prepare(`
    SELECT payload, consumed_at FROM oidc_payloads
    WHERE user_code = ? AND model = ?
  `),
  consume: sqlite.prepare(`
    UPDATE oidc_payloads SET consumed_at = ? WHERE id = ? AND model = ?
  `),
  destroy: sqlite.prepare(`
    DELETE FROM oidc_payloads WHERE id = ? AND model = ?
  `),
  revokeByGrantId: sqlite.prepare(`
    DELETE FROM oidc_payloads WHERE grant_id = ? AND model = ?
  `),
  cleanup: sqlite.prepare(`
    DELETE FROM oidc_payloads WHERE expires_at IS NOT NULL AND expires_at < ?
  `),
};

// Models that can be revoked by grant_id
const GRANTABLE = new Set([
  "AccessToken",
  "AuthorizationCode",
  "RefreshToken",
  "DeviceCode",
  "BackchannelAuthenticationRequest",
]);

function rowToPayload(row: { payload: string; consumed_at: number | null } | undefined): AdapterPayload | undefined {
  if (!row) return undefined;
  const data = JSON.parse(row.payload) as AdapterPayload;
  if (row.consumed_at) {
    data.consumed = row.consumed_at;
  }
  return data;
}

export class SqliteAdapter implements Adapter {
  private model: string;

  constructor(model: string) {
    this.model = model;
  }

  async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
    const expiresAt = expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : null;

    stmts.upsert.run(
      id,
      this.model,
      JSON.stringify(payload),
      expiresAt,
      payload.uid ?? null,
      payload.userCode ?? null,
      payload.grantId ?? null,
    );
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    const row = stmts.find.get(id, this.model) as { payload: string; consumed_at: number | null } | undefined;
    return rowToPayload(row);
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const row = stmts.findByUid.get(uid, this.model) as { payload: string; consumed_at: number | null } | undefined;
    return rowToPayload(row);
  }

  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    const row = stmts.findByUserCode.get(userCode, this.model) as { payload: string; consumed_at: number | null } | undefined;
    return rowToPayload(row);
  }

  async consume(id: string): Promise<void> {
    stmts.consume.run(Math.floor(Date.now() / 1000), id, this.model);
  }

  async destroy(id: string): Promise<void> {
    stmts.destroy.run(id, this.model);
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    if (GRANTABLE.has(this.model)) {
      stmts.revokeByGrantId.run(grantId, this.model);
    }
  }

  /**
   * Remove expired rows. Call periodically (e.g. every 10 minutes) to keep
   * the table small.
   */
  static cleanup(): void {
    const now = Math.floor(Date.now() / 1000);
    stmts.cleanup.run(now);
  }
}

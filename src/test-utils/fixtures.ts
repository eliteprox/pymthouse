import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/db/index";
import {
  appUsers,
  developerApps,
  signerConfig,
  users,
} from "@/db/schema";
import { createAppClient, rotateClientSecret } from "@/lib/oidc/clients";
import { createSession } from "@/lib/auth";

export interface SeededDeveloperApp {
  /**
   * Public OIDC client_id and developer_apps.id (they are the same string in this
   * project, matching the POST /api/v1/apps handler which sets `appId = clientId`).
   */
  clientId: string;
  /**
   * Internal primary key of the oidc_clients row (UUID, different from clientId).
   */
  oidcClientRowId: string;
  userId: string;
  clientSecret: string;
}

export async function createTestUser(opts?: { id?: string; role?: string }): Promise<string> {
  const id = opts?.id ?? `user-test-${randomUUID()}`;
  await db.insert(users).values({
    id,
    email: `${id}@example.test`,
    name: "Test User",
    oauthProvider: "bootstrap",
    oauthSubject: id,
    role: opts?.role ?? "developer",
  });
  return id;
}

/**
 * Creates a platform user and registers teardown to delete that row. Use for
 * tests that need an extra user outside {@link cleanupTestApp} (e.g. a
 * non-owner session against another user's app).
 */
export async function createTestUserWithCleanup(
  t: Pick<TestContext, "after">,
  opts?: { id?: string; role?: string },
): Promise<string> {
  const id = await createTestUser(opts);
  t.after(async () => {
    await db.delete(users).where(eq(users.id, id));
  });
  return id;
}

export async function seedDeveloperAppWithClient(opts?: {
  status?: "draft" | "submitted" | "in_review" | "approved" | "rejected";
  ownerId?: string;
  name?: string;
}): Promise<SeededDeveloperApp> {
  const status = opts?.status ?? "approved";
  const userId = opts?.ownerId ?? (await createTestUser());
  const displayName = opts?.name ?? `Test App ${randomUUID().slice(0, 8)}`;

  const { id: oidcClientRowId, clientId } = await createAppClient(displayName);

  const clientSecret = await rotateClientSecret(clientId);
  if (!clientSecret) {
    throw new Error("Failed to rotate client secret for test fixture");
  }

  const now = new Date().toISOString();
  await db.insert(developerApps).values({
    id: clientId,
    ownerId: userId,
    oidcClientId: oidcClientRowId,
    name: displayName,
    status,
    createdAt: now,
    updatedAt: now,
  });

  return { clientId, oidcClientRowId, userId, clientSecret };
}

export async function createJobTokenForApp(opts: {
  userId?: string;
  endUserId?: string;
  clientId: string;
  scopes?: string;
}): Promise<string> {
  const { token } = await createSession({
    userId: opts.userId,
    endUserId: opts.endUserId,
    appId: opts.clientId,
    scopes: opts.scopes ?? "sign:job",
    expiresInDays: 1,
  });
  return token;
}

/**
 * Create a provider-managed `app_users` row alongside a matching platform
 * `users` row that shares the same primary key. This mirrors how the Usage API
 * groups `usage_records.user_id` by joining to `app_users.id`, while still
 * satisfying the FK from `sessions.user_id` so we can mint bearer tokens for
 * this user without touching the legacy `end_users` table.
 */
export async function createAppUser(opts: {
  clientId: string;
  externalUserId: string;
}): Promise<{ id: string; externalUserId: string }> {
  const id = `app-user-${randomUUID()}`;
  await createTestUser({ id });
  await db.insert(appUsers).values({
    id,
    clientId: opts.clientId,
    externalUserId: opts.externalUserId,
    status: "active",
  });
  return { id, externalUserId: opts.externalUserId };
}

/**
 * Ensure the default signer row exists and is marked running so proxy routes
 * forward requests. Returns a restore function that resets any captured state.
 */
export async function ensureRunningSigner(): Promise<() => Promise<void>> {
  const defaultSignerRows = await db
    .select()
    .from(signerConfig)
    .where(eq(signerConfig.id, "default"))
    .limit(1);
  const defaultSigner = defaultSignerRows[0];
  if (defaultSigner) {
    await db
      .update(signerConfig)
      .set({ status: "running", signerUrl: "http://test-signer.invalid" })
      .where(eq(signerConfig.id, "default"));
  } else {
    await db.insert(signerConfig).values({
      id: "default",
      name: "pymthouse test signer",
      signerUrl: "http://test-signer.invalid",
      status: "running",
      network: "arbitrum-one-mainnet",
      ethRpcUrl: "https://arb1.arbitrum.io/rpc",
      signerPort: 8081,
      defaultCutPercent: 15,
      billingMode: "delegated",
    });
  }

  // Tests run in parallel; restoring signer status in each test can flip a
  // shared row back to "stopped" while another test still needs it.
  return async () => {};
}

/**
 * Remove everything inserted under a seeded developer app (including the
 * oidc client row, the owner user, usage rows, and any test sessions scoped
 * to the client). Safe to call even when some of the related rows are missing.
 */
export async function cleanupTestApp(
  app: SeededDeveloperApp | undefined | null,
): Promise<void> {
  if (!app?.clientId || !app.oidcClientRowId || !app.userId) {
    return;
  }

  // Dynamic import avoids rare ESM circular-init cases where top-level named
  // table imports are still undefined when `t.after` teardown runs (seen on CI).
  const m = await import("@/db/schema");

  const appId = app.clientId;
  const oidcClientPublic = app.clientId;
  const oidcClientPk = app.oidcClientRowId;
  const ownerId = app.userId;

  await db.delete(m.sessions).where(eq(m.sessions.appId, oidcClientPublic));

  await db.delete(m.oidcAuthCodes).where(eq(m.oidcAuthCodes.clientId, oidcClientPublic));
  await db.delete(m.oidcRefreshTokens).where(eq(m.oidcRefreshTokens.clientId, oidcClientPublic));
  await db.delete(m.oidcDeviceCodes).where(eq(m.oidcDeviceCodes.clientId, oidcClientPublic));

  await db.delete(m.apiKeys).where(eq(m.apiKeys.clientId, appId));
  await db.delete(m.subscriptions).where(eq(m.subscriptions.clientId, appId));
  await db.delete(m.planCapabilityBundles).where(eq(m.planCapabilityBundles.clientId, appId));
  await db.delete(m.plans).where(eq(m.plans.clientId, appId));

  await db.delete(m.usageRecords).where(eq(m.usageRecords.clientId, appId));
  await db.delete(m.authAuditLog).where(eq(m.authAuditLog.clientId, appId));
  await db.delete(m.appAllowedDomains).where(eq(m.appAllowedDomains.appId, appId));

  const appUserRows = await db
    .select({ id: m.appUsers.id })
    .from(m.appUsers)
    .where(eq(m.appUsers.clientId, appId));
  const appUserIds = appUserRows.map((row) => row.id);
  if (appUserIds.length > 0) {
    await db
      .delete(m.sessions)
      .where(inArray(m.sessions.userId, appUserIds));
  }
  await db.delete(m.appUsers).where(eq(m.appUsers.clientId, appId));
  await db.delete(m.providerAdmins).where(eq(m.providerAdmins.clientId, appId));

  const endUserRows = await db
    .select({ id: m.endUsers.id })
    .from(m.endUsers)
    .where(eq(m.endUsers.appId, appId));
  const endUserIds = endUserRows.map((row) => row.id);

  if (endUserIds.length > 0) {
    await db
      .delete(m.transactions)
      .where(inArray(m.transactions.endUserId, endUserIds));
    await db
      .delete(m.streamSessions)
      .where(inArray(m.streamSessions.endUserId, endUserIds));
  }

  await db.delete(m.streamSessions).where(eq(m.streamSessions.appId, appId));
  await db.delete(m.transactions).where(eq(m.transactions.clientId, appId));
  await db.delete(m.transactions).where(eq(m.transactions.appId, appId));
  await db.delete(m.endUsers).where(eq(m.endUsers.appId, appId));

  await db.delete(m.developerApps).where(eq(m.developerApps.id, appId));
  await db.delete(m.oidcClients).where(eq(m.oidcClients.id, oidcClientPk));
  if (appUserIds.length > 0) {
    await db.delete(m.users).where(inArray(m.users.id, appUserIds));
  }
  await db.delete(m.users).where(eq(m.users.id, ownerId));
}

export function basicAuthHeader(clientId: string, clientSecret: string): string {
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
}

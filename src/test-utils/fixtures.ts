import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/db/index";
import {
  apiKeys,
  appAllowedDomains,
  appUsers,
  authAuditLog,
  developerApps,
  endUsers,
  oidcAuthCodes,
  oidcClients,
  oidcDeviceCodes,
  oidcRefreshTokens,
  planCapabilityBundles,
  plans,
  providerAdmins,
  sessions,
  signerConfig,
  streamSessions,
  subscriptions,
  transactions,
  usageRecords,
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
  const existingRows = await db
    .select()
    .from(signerConfig)
    .where(eq(signerConfig.id, "default"))
    .limit(1);
  const existing = existingRows[0];

  if (existing) {
    await db
      .update(signerConfig)
      .set({ status: "running", signerUrl: "http://test-signer.invalid" })
      .where(eq(signerConfig.id, "default"));

    return async () => {
      await db
        .update(signerConfig)
        .set({
          status: existing.status,
          signerUrl: existing.signerUrl,
        })
        .where(eq(signerConfig.id, "default"));
    };
  }

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

  return async () => {
    await db.delete(signerConfig).where(eq(signerConfig.id, "default"));
  };
}

/**
 * Remove everything inserted under a seeded developer app (including the
 * oidc client row, the owner user, usage rows, and any test sessions scoped
 * to the client). Safe to call even when some of the related rows are missing.
 */
export async function cleanupTestApp(app: SeededDeveloperApp): Promise<void> {
  const appId = app.clientId;
  const oidcClientPublic = app.clientId;
  const oidcClientPk = app.oidcClientRowId;
  const ownerId = app.userId;

  await db.delete(sessions).where(eq(sessions.appId, oidcClientPublic));

  await db.delete(oidcAuthCodes).where(eq(oidcAuthCodes.clientId, oidcClientPublic));
  await db.delete(oidcRefreshTokens).where(eq(oidcRefreshTokens.clientId, oidcClientPublic));
  await db.delete(oidcDeviceCodes).where(eq(oidcDeviceCodes.clientId, oidcClientPublic));

  await db.delete(apiKeys).where(eq(apiKeys.clientId, appId));
  await db.delete(subscriptions).where(eq(subscriptions.clientId, appId));
  await db.delete(planCapabilityBundles).where(eq(planCapabilityBundles.clientId, appId));
  await db.delete(plans).where(eq(plans.clientId, appId));

  await db.delete(usageRecords).where(eq(usageRecords.clientId, appId));
  await db.delete(authAuditLog).where(eq(authAuditLog.clientId, appId));
  await db.delete(appAllowedDomains).where(eq(appAllowedDomains.appId, appId));

  const appUserRows = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(eq(appUsers.clientId, appId));
  const appUserIds = appUserRows.map((row) => row.id);
  if (appUserIds.length > 0) {
    await db
      .delete(sessions)
      .where(inArray(sessions.userId, appUserIds));
  }
  await db.delete(appUsers).where(eq(appUsers.clientId, appId));
  await db.delete(providerAdmins).where(eq(providerAdmins.clientId, appId));

  const endUserRows = await db
    .select({ id: endUsers.id })
    .from(endUsers)
    .where(eq(endUsers.appId, appId));
  const endUserIds = endUserRows.map((row) => row.id);

  if (endUserIds.length > 0) {
    await db
      .delete(transactions)
      .where(inArray(transactions.endUserId, endUserIds));
    await db
      .delete(streamSessions)
      .where(inArray(streamSessions.endUserId, endUserIds));
  }

  await db.delete(streamSessions).where(eq(streamSessions.appId, appId));
  await db.delete(transactions).where(eq(transactions.clientId, appId));
  await db.delete(transactions).where(eq(transactions.appId, appId));
  await db.delete(endUsers).where(eq(endUsers.appId, appId));

  await db.delete(developerApps).where(eq(developerApps.id, appId));
  await db.delete(oidcClients).where(eq(oidcClients.id, oidcClientPk));
  if (appUserIds.length > 0) {
    await db.delete(users).where(inArray(users.id, appUserIds));
  }
  await db.delete(users).where(eq(users.id, ownerId));
}

export function basicAuthHeader(clientId: string, clientSecret: string): string {
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
}

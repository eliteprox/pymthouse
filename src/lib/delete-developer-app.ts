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
} from "@/db/schema";
import { eq, inArray, or } from "drizzle-orm";

/**
 * Permanently removes a developer app row and dependent records.
 * Caller must enforce authorization (e.g. owner-only, draft-only).
 */
export async function deleteDeveloperAppAndRelatedData(
  appInternalId: string,
  oidcClientPk: string | null,
): Promise<void> {
  const oauthClientIdInternal = oidcClientPk;

  await db.transaction(async (tx) => {
    if (oauthClientIdInternal) {
      await tx.delete(oidcAuthCodes).where(eq(oidcAuthCodes.clientId, oauthClientIdInternal));
      await tx.delete(oidcRefreshTokens).where(eq(oidcRefreshTokens.clientId, oauthClientIdInternal));
      await tx.delete(oidcDeviceCodes).where(eq(oidcDeviceCodes.clientId, oauthClientIdInternal));
    }

    await tx.delete(apiKeys).where(eq(apiKeys.clientId, appInternalId));
    await tx.delete(subscriptions).where(eq(subscriptions.clientId, appInternalId));
    await tx.delete(planCapabilityBundles).where(eq(planCapabilityBundles.clientId, appInternalId));
    await tx.delete(plans).where(eq(plans.clientId, appInternalId));

    await tx.delete(usageRecords).where(eq(usageRecords.clientId, appInternalId));
    await tx.delete(authAuditLog).where(eq(authAuditLog.clientId, appInternalId));
    await tx.delete(appAllowedDomains).where(eq(appAllowedDomains.appId, appInternalId));
    await tx.delete(appUsers).where(eq(appUsers.clientId, appInternalId));
    await tx.delete(providerAdmins).where(eq(providerAdmins.clientId, appInternalId));

    const endUserRows = await tx
      .select({ id: endUsers.id })
      .from(endUsers)
      .where(eq(endUsers.appId, appInternalId));
    const endUserIds = endUserRows.map((row) => row.id);

    const streamSessionCond =
      endUserIds.length > 0
        ? or(eq(streamSessions.appId, appInternalId), inArray(streamSessions.endUserId, endUserIds))
        : eq(streamSessions.appId, appInternalId);

    const sessionIdRows = await tx
      .select({ id: streamSessions.id })
      .from(streamSessions)
      .where(streamSessionCond);
    const streamSessionIds = sessionIdRows.map((row) => row.id);
    if (streamSessionIds.length > 0) {
      await tx.delete(transactions).where(inArray(transactions.streamSessionId, streamSessionIds));
    }
    await tx.delete(streamSessions).where(streamSessionCond);

    await tx.delete(transactions).where(eq(transactions.clientId, appInternalId));
    await tx.delete(transactions).where(eq(transactions.appId, appInternalId));
    if (endUserIds.length > 0) {
      await tx.delete(transactions).where(inArray(transactions.endUserId, endUserIds));
    }

    await tx.delete(endUsers).where(eq(endUsers.appId, appInternalId));

    await tx.delete(sessions).where(eq(sessions.appId, appInternalId));
    await tx.delete(signerConfig).where(eq(signerConfig.clientId, appInternalId));

    await tx.delete(developerApps).where(eq(developerApps.id, appInternalId));

    if (oidcClientPk) {
      await tx.delete(oidcClients).where(eq(oidcClients.id, oidcClientPk));
    }
  });
}

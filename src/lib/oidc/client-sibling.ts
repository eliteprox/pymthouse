import { eq, or } from "drizzle-orm";
import { db } from "@/db/index";
import { developerApps, oidcClients } from "@/db/schema";

export type DrizzleDb = typeof db;

/**
 * Resolve the developer app and public `app_…` client_id for either the public OIDC row
 * or the paired M2M row (same pattern as device approval token exchange).
 */
export async function resolveDeveloperAppAndPublicClientForOidcRow(
  dbConn: DrizzleDb,
  oidcClientRowId: string,
): Promise<{ developerAppId: string; publicClientId: string } | null> {
  const appRows = await dbConn
    .select({
      id: developerApps.id,
      oidcClientId: developerApps.oidcClientId,
    })
    .from(developerApps)
    .where(
      or(
        eq(developerApps.oidcClientId, oidcClientRowId),
        eq(developerApps.m2mOidcClientId, oidcClientRowId),
      ),
    )
    .limit(1);
  const app = appRows[0];
  if (!app?.oidcClientId) return null;
  const publicRows = await dbConn
    .select({ clientId: oidcClients.clientId })
    .from(oidcClients)
    .where(eq(oidcClients.id, app.oidcClientId))
    .limit(1);
  const publicClientId = publicRows[0]?.clientId;
  if (!publicClientId) return null;
  return { developerAppId: app.id, publicClientId };
}

/**
 * After validateClientSecret: resolve public `app_…` client_id for M2M or public row.
 */
export async function resolvePublicClientIdForOidcRow(
  dbConn: DrizzleDb,
  clientRowId: string,
): Promise<string | null> {
  const ctx = await resolveDeveloperAppAndPublicClientForOidcRow(
    dbConn,
    clientRowId,
  );
  return ctx?.publicClientId ?? null;
}

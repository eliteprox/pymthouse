import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps, oidcClients, appAllowedDomains } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { updateClientConfig } from "@/lib/oidc/clients";
import { DEFAULT_OIDC_SCOPES } from "@/lib/oidc/scopes";

async function getAuthenticatedOwner(appId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const userId = (session.user as Record<string, unknown>).id as string;
  const role = (session.user as Record<string, unknown>).role as string;
  if (!userId) return null;

  const app = db
    .select()
    .from(developerApps)
    .where(eq(developerApps.id, appId))
    .get();

  if (!app) return null;
  if (app.ownerId !== userId && role !== "admin") return null;

  return { app, userId, role };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthenticatedOwner(id);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { app } = auth;

  let clientInfo = null;
  if (app.oidcClientId) {
    const client = db
      .select()
      .from(oidcClients)
      .where(eq(oidcClients.id, app.oidcClientId))
      .get();

    if (client) {
      clientInfo = {
        clientId: client.clientId,
        redirectUris: JSON.parse(client.redirectUris) as string[],
        allowedScopes: client.allowedScopes,
        grantTypes: client.grantTypes,
        tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
        hasSecret: !!client.clientSecretHash,
        postLogoutRedirectUris: client.postLogoutRedirectUris
          ? (JSON.parse(client.postLogoutRedirectUris) as string[])
          : [],
        initiateLoginUri: client.initiateLoginUri,
        logoUri: client.logoUri,
        policyUri: client.policyUri,
        tosUri: client.tosUri,
        clientUri: client.clientUri,
      };
    }
  }

  const domains = db
    .select()
    .from(appAllowedDomains)
    .where(eq(appAllowedDomains.appId, app.id))
    .all();

  // For approved apps with pending revision, surface pending scopes/grant types for the form.
  // Form uses pending values when editing; live OIDC continues to use oidcClient values.
  const effectiveScopes =
    app.status === "approved" && app.pendingScopes != null
      ? app.pendingScopes
      : clientInfo?.allowedScopes ?? DEFAULT_OIDC_SCOPES;
  const effectiveGrantTypes =
    app.status === "approved" && app.pendingGrantTypes != null
      ? app.pendingGrantTypes
      : clientInfo?.grantTypes ?? "authorization_code,refresh_token";

  return NextResponse.json({
    ...app,
    oidcClient: clientInfo
      ? {
          ...clientInfo,
          // Effective values for form: pending (if editing revision) or current live
          allowedScopes: effectiveScopes,
          grantTypes: effectiveGrantTypes,
        }
      : null,
    domains,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthenticatedOwner(id);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { app } = auth;
  const body = await request.json();

  const now = new Date().toISOString();

  const appUpdates: Record<string, unknown> = { updatedAt: now };
  const appFields = [
    "name", "subtitle", "description", "category",
    "logoLightUrl", "logoDarkUrl", "developerName", "websiteUrl",
    "supportUrl", "privacyPolicyUrl", "tosUrl", "demoRecordingUrl",
  ] as const;

  for (const field of appFields) {
    if (body[field] !== undefined) {
      appUpdates[field] = body[field];
    }
  }

  if (body.linksToPurchases !== undefined) {
    appUpdates.linksToPurchases = body.linksToPurchases ? 1 : 0;
  }

  // Approved apps: scope/grant changes go to pending (draft) only; OIDC stays unchanged until revision is approved.
  if (app.status === "approved") {
    if (body.allowedScopes !== undefined) {
      appUpdates.pendingScopes =
        typeof body.allowedScopes === "string"
          ? body.allowedScopes
          : Array.isArray(body.allowedScopes)
            ? (body.allowedScopes as string[]).join(" ")
            : body.allowedScopes;
    }
    if (body.grantTypes !== undefined) {
      appUpdates.pendingGrantTypes = Array.isArray(body.grantTypes)
        ? (body.grantTypes as string[]).join(",")
        : String(body.grantTypes);
    }
  }

  db.update(developerApps)
    .set(appUpdates)
    .where(eq(developerApps.id, app.id))
    .run();

  // Update OIDC client config. For approved apps, scopes and grant types are locked.
  if (app.oidcClientId) {
    const client = db
      .select()
      .from(oidcClients)
      .where(eq(oidcClients.id, app.oidcClientId))
      .get();

    if (client) {
      const clientUpdates: Parameters<typeof updateClientConfig>[1] = {};
      if (body.name) clientUpdates.displayName = body.name;
      if (body.redirectUris) clientUpdates.redirectUris = body.redirectUris;
      if (body.tokenEndpointAuthMethod)
        clientUpdates.tokenEndpointAuthMethod = body.tokenEndpointAuthMethod;
      // Non-approved apps: scopes/grant types go directly to OIDC. Approved apps use pending (handled above).
      if (app.status !== "approved") {
        if (body.allowedScopes) clientUpdates.allowedScopes = body.allowedScopes;
        if (body.grantTypes) clientUpdates.grantTypes = body.grantTypes;
      }

      if (Object.keys(clientUpdates).length > 0) {
        updateClientConfig(client.clientId, clientUpdates);
      }
    }
  }

  return NextResponse.json({ success: true });
}

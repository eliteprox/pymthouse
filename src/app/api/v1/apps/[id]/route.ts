import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps, oidcClients, appAllowedDomains } from "@/db/schema";
import { eq } from "drizzle-orm";
import { updateClientConfig } from "@/lib/oidc/clients";
import { DEFAULT_OIDC_SCOPES, OIDC_SCOPES } from "@/lib/oidc/scopes";
import {
  canEditProviderApp,
  getAuthorizedProviderApp,
  appEditForbiddenResponse,
} from "@/lib/provider-apps";
import { deleteDeveloperAppAndRelatedData } from "@/lib/delete-developer-app";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const auth = await getAuthorizedProviderApp(clientId);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { app } = auth;

  let clientInfo = null;
  if (app.oidcClientId) {
    const clientRowsGet = await db
      .select()
      .from(oidcClients)
      .where(eq(oidcClients.id, app.oidcClientId))
      .limit(1);
    const client = clientRowsGet[0];

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

  const domains = await db
    .select()
    .from(appAllowedDomains)
    .where(eq(appAllowedDomains.appId, app.id));

  const canonicalClientId = clientInfo?.clientId ?? clientId;
  const { oidcClientId: _oidcClientId, ...appWithoutOidcClientId } = app;
  return NextResponse.json({
    ...appWithoutOidcClientId,
    id: canonicalClientId,
    clientId: canonicalClientId,
    canEdit: await canEditProviderApp(auth),
    canSubmitForReview: auth.app.ownerId === auth.userId,
    oidcClient: clientInfo
      ? {
          ...clientInfo,
          allowedScopes: clientInfo.allowedScopes ?? DEFAULT_OIDC_SCOPES,
        }
      : null,
    domains,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const auth = await getAuthorizedProviderApp(clientId);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await canEditProviderApp(auth))) {
    return appEditForbiddenResponse();
  }

  const { app } = auth;
  const body = await request.json();

  const now = new Date().toISOString();

  const appUpdates: Record<string, unknown> = { updatedAt: now };
  const appFields = [
    "name",
    "description",
    "developerName",
    "websiteUrl",
  ] as const;

  for (const field of appFields) {
    if (body[field] !== undefined) {
      appUpdates[field] = body[field];
    }
  }

  await db.update(developerApps).set(appUpdates).where(eq(developerApps.id, app.id));

  // Provider apps are self-service in the MVP, so OIDC config updates apply immediately.
  if (app.oidcClientId) {
    const clientRowsPut = await db
      .select()
      .from(oidcClients)
      .where(eq(oidcClients.id, app.oidcClientId))
      .limit(1);
    const client = clientRowsPut[0];

    if (client) {
      const clientUpdates: Parameters<typeof updateClientConfig>[1] = {};
      if (body.name) clientUpdates.displayName = body.name;
      if (body.redirectUris) clientUpdates.redirectUris = body.redirectUris;
      if (body.tokenEndpointAuthMethod)
        clientUpdates.tokenEndpointAuthMethod = body.tokenEndpointAuthMethod;
      if (body.allowedScopes) {
        const validScopeValues = new Set(OIDC_SCOPES.map((s) => s.value));
        const filtered = String(body.allowedScopes)
          .split(/[,\s]+/)
          .filter((s) => s && validScopeValues.has(s))
          .join(" ");
        clientUpdates.allowedScopes = filtered || DEFAULT_OIDC_SCOPES;
      }
      if (body.grantTypes) clientUpdates.grantTypes = body.grantTypes;

      if (Object.keys(clientUpdates).length > 0) {
        await updateClientConfig(client.clientId, clientUpdates);
      }
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const auth = await getAuthorizedProviderApp(clientId);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (auth.app.ownerId !== auth.userId) {
    return NextResponse.json(
      { error: "Only the app owner can delete this app." },
      { status: 403 },
    );
  }

  if (auth.app.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft apps can be deleted." },
      { status: 400 },
    );
  }

  await deleteDeveloperAppAndRelatedData(auth.app.id, auth.app.oidcClientId ?? null);

  return new NextResponse(null, { status: 204 });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps, oidcClients, appAllowedDomains } from "@/db/schema";
import { eq } from "drizzle-orm";
import { updateClientConfig } from "@/lib/oidc/clients";
import { resetProvider } from "@/lib/oidc/provider";
import { normalizeDomainWhitelist } from "@/lib/domain-whitelist";
import { v4 as uuidv4 } from "uuid";

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

function extractOrigins(uris: string[]): string[] {
  const origins = new Set<string>();
  for (const uri of uris) {
    try {
      const url = new URL(uri);
      origins.add(url.origin);
    } catch {
      /* skip malformed URIs */
    }
  }
  return Array.from(origins);
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
  if (!app.oidcClientId) {
    return NextResponse.json(
      { error: "App has no OIDC client" },
      { status: 400 }
    );
  }

  const client = db
    .select()
    .from(oidcClients)
    .where(eq(oidcClients.id, app.oidcClientId))
    .get();

  if (!client) {
    return NextResponse.json(
      { error: "OIDC client not found" },
      { status: 404 }
    );
  }

  const body = await request.json();

  // Build update payload from allowed fields
  const clientUpdates: Parameters<typeof updateClientConfig>[1] = {};

  if (Array.isArray(body.redirectUris)) {
    clientUpdates.redirectUris = body.redirectUris;
  }
  if (Array.isArray(body.postLogoutRedirectUris)) {
    clientUpdates.postLogoutRedirectUris = body.postLogoutRedirectUris;
  }
  if (body.initiateLoginUri !== undefined) {
    clientUpdates.initiateLoginUri = body.initiateLoginUri || null;
  }
  if (body.tokenEndpointAuthMethod !== undefined) {
    clientUpdates.tokenEndpointAuthMethod = body.tokenEndpointAuthMethod;
  }

  // Auto-sync branding from developerApps
  clientUpdates.logoUri = app.logoLightUrl || null;
  clientUpdates.clientUri = app.websiteUrl || null;
  clientUpdates.policyUri = app.privacyPolicyUrl || null;
  clientUpdates.tosUri = app.tosUrl || null;

  updateClientConfig(client.clientId, clientUpdates);

  // Auto-populate domain whitelist from redirect URI origins
  const allRedirects = [
    ...(clientUpdates.redirectUris ?? JSON.parse(client.redirectUris) as string[]),
    ...(clientUpdates.postLogoutRedirectUris ?? []),
  ];
  const origins = extractOrigins(allRedirects);

  const existingDomains = db
    .select()
    .from(appAllowedDomains)
    .where(eq(appAllowedDomains.appId, app.id))
    .all();
  const existingSet = new Set(existingDomains.map((d) => d.domain.toLowerCase()));

  for (const origin of origins) {
    const result = normalizeDomainWhitelist(origin);
    if (!result.success) continue;
    const normalized = result.normalized.toLowerCase();
    if (!existingSet.has(normalized)) {
      db.insert(appAllowedDomains)
        .values({ id: uuidv4(), appId: app.id, domain: result.normalized })
        .run();
      existingSet.add(normalized);
    }
  }

  // Reset provider so in-memory client cache picks up changes
  resetProvider();

  return NextResponse.json({ success: true });
}

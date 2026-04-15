import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps, oidcClients, providerAdmins } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { createAppClient } from "@/lib/oidc/clients";
import { ensureProviderAdminMembership } from "@/lib/provider-apps";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as Record<string, unknown>).id as string;
  if (!userId) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const memberships = await db
    .select({ clientId: providerAdmins.clientId })
    .from(providerAdmins)
    .where(eq(providerAdmins.userId, userId));

  const memberIds = memberships.map((membership) => membership.clientId);
  const ownedApps = await db
    .select({
      id: oidcClients.clientId,
      name: developerApps.name,
      subtitle: developerApps.subtitle,
      category: developerApps.category,
      status: developerApps.status,
      logoLightUrl: developerApps.logoLightUrl,
      brandingMode: developerApps.brandingMode,
      customLoginEnabled: developerApps.customLoginEnabled,
      customLoginDomain: developerApps.customLoginDomain,
      createdAt: developerApps.createdAt,
      updatedAt: developerApps.updatedAt,
      clientId: oidcClients.clientId,
    })
    .from(developerApps)
    .leftJoin(oidcClients, eq(developerApps.oidcClientId, oidcClients.id))
    .where(eq(developerApps.ownerId, userId));

  const memberApps =
    memberIds.length === 0
      ? []
      : await db
        .select({
          id: oidcClients.clientId,
          name: developerApps.name,
          subtitle: developerApps.subtitle,
          category: developerApps.category,
          status: developerApps.status,
          logoLightUrl: developerApps.logoLightUrl,
          brandingMode: developerApps.brandingMode,
          customLoginEnabled: developerApps.customLoginEnabled,
          customLoginDomain: developerApps.customLoginDomain,
          createdAt: developerApps.createdAt,
          updatedAt: developerApps.updatedAt,
          clientId: oidcClients.clientId,
        })
        .from(developerApps)
        .leftJoin(oidcClients, eq(developerApps.oidcClientId, oidcClients.id))
        .where(inArray(developerApps.id, memberIds));

  const apps = [...ownedApps, ...memberApps].filter(
    (app, index, rows) => rows.findIndex((row) => row.id === app.id) === index,
  );

  return NextResponse.json({ apps });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as Record<string, unknown>).id as string;
  if (!userId) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const body = await request.json();
  const { name } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "App name is required" },
      { status: 400 }
    );
  }

  const { id: oidcRowId, clientId } = await createAppClient(name.trim());

  const appId = clientId;
  const now = new Date().toISOString();

  await db.insert(developerApps).values({
    id: appId,
    ownerId: userId,
    oidcClientId: oidcRowId,
    name: name.trim(),
    developerName: body.developerName || null,
    websiteUrl: body.websiteUrl || null,
    status: "draft", // Apps start as draft and require admin approval
    createdAt: now,
    updatedAt: now,
  });

  await ensureProviderAdminMembership(userId, appId);

  return NextResponse.json(
    { id: clientId, clientId, status: "draft" },
    { status: 201 }
  );
}

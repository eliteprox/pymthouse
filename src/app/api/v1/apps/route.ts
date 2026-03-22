import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps, oidcClients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { createAppClient } from "@/lib/oidc/clients";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as Record<string, unknown>).id as string;
  if (!userId) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const apps = db
    .select({
      id: developerApps.id,
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
    .where(eq(developerApps.ownerId, userId))
    .all();

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

  const { id: oidcRowId, clientId } = createAppClient(name.trim());

  const appId = uuidv4();
  const now = new Date().toISOString();

  db.insert(developerApps)
    .values({
      id: appId,
      ownerId: userId,
      oidcClientId: oidcRowId,
      name: name.trim(),
      subtitle: body.subtitle || null,
      description: body.description || null,
      category: body.category || null,
      developerName: body.developerName || null,
      websiteUrl: body.websiteUrl || null,
      // Default to black-label mode (pymthouse branding)
      brandingMode: "blackLabel",
      customLoginEnabled: 0,
      customIssuerEnabled: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return NextResponse.json(
    { id: appId, clientId, status: "draft" },
    { status: 201 }
  );
}

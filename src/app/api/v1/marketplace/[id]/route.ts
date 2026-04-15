import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { developerApps, oidcClients } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;

  const results = await db
    .select({
      id: oidcClients.clientId,
      name: developerApps.name,
      subtitle: developerApps.subtitle,
      description: developerApps.description,
      category: developerApps.category,
      logoLightUrl: developerApps.logoLightUrl,
      logoDarkUrl: developerApps.logoDarkUrl,
      developerName: developerApps.developerName,
      websiteUrl: developerApps.websiteUrl,
      supportUrl: developerApps.supportUrl,
      privacyPolicyUrl: developerApps.privacyPolicyUrl,
      tosUrl: developerApps.tosUrl,
      clientId: oidcClients.clientId,
      grantTypes: oidcClients.grantTypes,
      createdAt: developerApps.createdAt,
    })
    .from(developerApps)
    .innerJoin(oidcClients, eq(developerApps.oidcClientId, oidcClients.id))
    .where(and(eq(oidcClients.clientId, clientId), eq(developerApps.status, "approved")))
    .limit(1);

  const app = results[0];

  if (!app) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(app);
}

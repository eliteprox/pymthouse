import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { developerApps, oidcClients } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const app = db
    .select({
      id: developerApps.id,
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
    .leftJoin(oidcClients, eq(developerApps.oidcClientId, oidcClients.id))
    .where(and(eq(developerApps.id, id), eq(developerApps.status, "approved")))
    .get();

  if (!app) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(app);
}

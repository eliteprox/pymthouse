import { NextResponse } from "next/server";
import { db } from "@/db/index";
import { developerApps, oidcClients } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const apps = db
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
      clientId: oidcClients.clientId,
      createdAt: developerApps.createdAt,
    })
    .from(developerApps)
    .leftJoin(oidcClients, eq(developerApps.oidcClientId, oidcClients.id))
    .where(eq(developerApps.status, "approved"))
    .all();

  return NextResponse.json({ apps });
}

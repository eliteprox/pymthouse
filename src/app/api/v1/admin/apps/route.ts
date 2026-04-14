import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps, users, oidcClients } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as Record<string, unknown>).role as string;
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const apps = await db
      .select({
        id: developerApps.id,
        name: developerApps.name,
        subtitle: developerApps.subtitle,
        category: developerApps.category,
        status: developerApps.status,
        developerName: developerApps.developerName,
        submittedAt: developerApps.submittedAt,
        pendingRevisionSubmittedAt: developerApps.pendingRevisionSubmittedAt,
        createdAt: developerApps.createdAt,
        ownerEmail: users.email,
        ownerName: users.name,
        clientId: oidcClients.clientId,
      })
      .from(developerApps)
      .leftJoin(users, eq(developerApps.ownerId, users.id))
      .leftJoin(oidcClients, eq(developerApps.oidcClientId, oidcClients.id))
      .where(
        inArray(developerApps.status, ["submitted", "in_review", "approved", "rejected"])
      );

    return NextResponse.json({ apps: apps || [] });
  } catch (error) {
    console.error("Admin apps API error:", error);
    return NextResponse.json({ apps: [] });
  }
}

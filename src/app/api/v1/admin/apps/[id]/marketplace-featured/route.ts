import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getProviderApp } from "@/lib/provider-apps";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as Record<string, unknown>).role as string;
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: clientId } = await params;
  const app = await getProviderApp(clientId);

  if (!app) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (app.status !== "approved") {
    return NextResponse.json(
      { error: "Only approved apps can be featured on the marketplace" },
      { status: 400 },
    );
  }

  let body: { featured?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.featured !== "boolean") {
    return NextResponse.json(
      { error: "Body must include featured: boolean" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const marketplaceFeatured = body.featured ? 1 : 0;

  await db
    .update(developerApps)
    .set({
      marketplaceFeatured,
      updatedAt: now,
    })
    .where(eq(developerApps.id, app.id));

  return NextResponse.json({
    success: true,
    featured: body.featured,
  });
}

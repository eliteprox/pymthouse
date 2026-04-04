import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/v1/apps/[id]/resubmit
 * For approved apps: submits a new version (scope/grant type changes) for review.
 * App stays approved and in production; the revision is reviewed separately.
 * Accepts allowedScopes and grantTypes in the body.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as Record<string, unknown>).id as string;

  const app = db
    .select()
    .from(developerApps)
    .where(eq(developerApps.id, id))
    .get();

  if (!app || app.ownerId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (app.status !== "approved") {
    return NextResponse.json(
      { error: "Only approved apps can be resubmitted for a new version" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const allowedScopes =
    typeof body.allowedScopes === "string"
      ? body.allowedScopes
      : (body.allowedScopes as string[])?.join?.(" ") ?? null;
  const grantTypes = Array.isArray(body.grantTypes)
    ? (body.grantTypes as string[]).join(",")
    : typeof body.grantTypes === "string"
      ? body.grantTypes
      : null;

  if (!allowedScopes || !grantTypes) {
    return NextResponse.json(
      {
        error:
          "allowedScopes and grantTypes are required when submitting a new version",
      },
      { status: 400 }
    );
  }

  const grantTypeList = grantTypes.split(",").map((g) => g.trim()).filter(Boolean);
  if (grantTypeList.length === 0) {
    return NextResponse.json(
      { error: "At least one grant type is required" },
      { status: 400 }
    );
  }

  const scopeList = allowedScopes.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  if (grantTypeList.includes("refresh_token") && !scopeList.includes("offline_access")) {
    return NextResponse.json(
      { error: "offline_access scope is required when refresh_token grant type is enabled" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  db.update(developerApps)
    .set({
      pendingScopes: allowedScopes,
      pendingGrantTypes: grantTypes,
      pendingRevisionSubmittedAt: now,
      reviewerNotes: null,
      reviewedBy: null,
      reviewedAt: null,
      updatedAt: now,
    })
    .where(eq(developerApps.id, id))
    .run();

  return NextResponse.json({
    success: true,
    status: "approved",
    pendingRevisionSubmitted: true,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * POST /api/v1/admin/apps/[id]/revoke
 * Revokes an approved app, reverting it to "submitted" (non-production).
 * The app returns to the review queue for re-approval.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as Record<string, unknown>).role as string;
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date().toISOString();
  const updated = await db.update(developerApps)
    .set({
      status: "submitted",
      submittedAt: now,
      updatedAt: now,
      reviewerNotes: null,
      reviewedBy: null,
      reviewedAt: null,
    })
    .where(and(eq(developerApps.id, id), eq(developerApps.status, "approved")))
    .returning({ id: developerApps.id });

  if (updated.length === 0) {
    return NextResponse.json(
      { error: "App not found or not in approved status" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, status: "submitted" });
}

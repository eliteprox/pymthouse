import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps } from "@/db/schema";
import { eq } from "drizzle-orm";

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

  const app = db
    .select()
    .from(developerApps)
    .where(eq(developerApps.id, id))
    .get();

  if (!app) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (app.status !== "approved") {
    return NextResponse.json(
      { error: "Only approved apps can be revoked" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  db.update(developerApps)
    .set({
      status: "submitted",
      submittedAt: now,
      updatedAt: now,
      reviewerNotes: null,
      reviewedBy: null,
      reviewedAt: null,
    })
    .where(eq(developerApps.id, id))
    .run();

  return NextResponse.json({ success: true, status: "submitted" });
}

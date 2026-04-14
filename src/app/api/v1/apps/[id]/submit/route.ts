/**
 * Submit app for review - transition from draft to submitted status
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as Record<string, unknown>).id as string;
  const { id } = await params;

  // Get the app
  const apps = await db
    .select()
    .from(developerApps)
    .where(eq(developerApps.id, id))
    .limit(1);

  if (apps.length === 0) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const app = apps[0];

  // Only the owner can submit the app
  if (app.ownerId !== userId) {
    return NextResponse.json(
      { error: "Only the app owner can submit for review" },
      { status: 403 }
    );
  }

  // Check current status - can only submit from draft or rejected
  if (!["draft", "rejected"].includes(app.status)) {
    return NextResponse.json(
      {
        error: "Invalid status",
        message: `App is currently ${app.status}. Only draft or rejected apps can be submitted for review.`,
      },
      { status: 400 }
    );
  }

  // Update status to submitted
  const now = new Date().toISOString();
  await db
    .update(developerApps)
    .set({
      status: "submitted",
      submittedAt: now,
      updatedAt: now,
    })
    .where(eq(developerApps.id, id));

  return NextResponse.json({
    success: true,
    status: "submitted",
    message: "App submitted for review",
  });
}

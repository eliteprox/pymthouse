/**
 * Submit app for review - transition from draft to submitted status
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getProviderApp } from "@/lib/provider-apps";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as Record<string, unknown>).id as string;
  const { id: clientId } = await params;
  const app = await getProviderApp(clientId);
  if (!app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  // Only the owner can submit the app
  if (app.ownerId !== userId) {
    return NextResponse.json(
      { error: "Only the app owner can submit for review" },
      { status: 403 }
    );
  }

  // Guarded update: atomically transition only from draft or rejected
  const now = new Date().toISOString();
  const updated = await db
    .update(developerApps)
    .set({
      status: "submitted",
      submittedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(developerApps.id, app.id),
        inArray(developerApps.status, ["draft", "rejected"]),
      ),
    )
    .returning({ id: developerApps.id });

  if (updated.length === 0) {
    return NextResponse.json(
      {
        error: "Invalid status",
        message: `App is currently ${app.status}. Only draft or rejected apps can be submitted for review.`,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    success: true,
    status: "submitted",
    message: "App submitted for review",
  });
}

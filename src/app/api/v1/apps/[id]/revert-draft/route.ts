/**
 * Withdraw from review — transition from submitted back to draft (owner only).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getProviderApp } from "@/lib/provider-apps";

export async function POST(
  _request: NextRequest,
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

  if (app.ownerId !== userId) {
    return NextResponse.json(
      { error: "Only the app owner can revert a submitted app to draft" },
      { status: 403 },
    );
  }

  const now = new Date().toISOString();
  const updated = await db
    .update(developerApps)
    .set({
      status: "draft",
      submittedAt: null,
      updatedAt: now,
    })
    .where(and(eq(developerApps.id, app.id), eq(developerApps.status, "submitted")))
    .returning({ id: developerApps.id });

  if (updated.length === 0) {
    return NextResponse.json(
      {
        error: "Invalid status",
        message: `App is currently ${app.status}. Only submitted apps can be reverted to draft.`,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    success: true,
    status: "draft",
    message: "App reverted to draft",
  });
}

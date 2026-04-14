import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps, oidcClients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { updateClientConfig } from "@/lib/oidc/clients";
import { publishProviderAndPlans } from "@/lib/naap-marketplace";

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
  const role = (session.user as Record<string, unknown>).role as string;

  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const appResults = await db
    .select()
    .from(developerApps)
    .where(eq(developerApps.id, id))
    .limit(1);

  const app = appResults[0];

  if (!app) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { action, notes } = body;

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: "action must be 'approve' or 'reject'" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  // Revision review: approved app with pending scope/grant changes
  if (
    app.status === "approved" &&
    app.pendingRevisionSubmittedAt &&
    app.pendingScopes &&
    app.pendingGrantTypes &&
    app.oidcClientId
  ) {
    const clientResults = await db
      .select()
      .from(oidcClients)
      .where(eq(oidcClients.id, app.oidcClientId))
      .limit(1);

    const client = clientResults[0];

    if (action === "approve" && client) {
      updateClientConfig(client.clientId, {
        allowedScopes: app.pendingScopes,
        grantTypes: app.pendingGrantTypes.split(",").filter(Boolean),
      });
    }

    await db.update(developerApps)
      .set({
        pendingScopes: null,
        pendingGrantTypes: null,
        pendingRevisionSubmittedAt: null,
        reviewerNotes: action === "reject" ? notes || null : null,
        updatedAt: now,
      })
      .where(eq(developerApps.id, id));

    return NextResponse.json({
      success: true,
      status: "approved",
      revisionApproved: action === "approve",
    });
  }

  // Initial review: submitted or in_review
  if (app.status !== "submitted" && app.status !== "in_review") {
    return NextResponse.json(
      { error: `Cannot review app with status '${app.status}'` },
      { status: 400 }
    );
  }

  const newStatus = action === "approve" ? "approved" : "rejected";

  await db.update(developerApps)
    .set({
      status: newStatus,
      reviewerNotes: notes || null,
      reviewedBy: userId,
      reviewedAt: now,
      publishedAt: action === "approve" ? now : null,
      updatedAt: now,
    })
    .where(eq(developerApps.id, id));

  // Publish to marketplace when approved
  if (action === "approve") {
    void publishProviderAndPlans(id).catch((err) => {
      console.error("Failed to publish app to marketplace:", err);
    });
  }

  return NextResponse.json({ success: true, status: newStatus });
}

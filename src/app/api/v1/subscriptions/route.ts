import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { plans, subscriptions } from "@/db/schema";

async function getSessionUserId() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as Record<string, unknown> | undefined)?.id as string | undefined;
  return userId ?? null;
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  return NextResponse.json({ subscriptions: rows });
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const planId = String(body.planId || "");
  const planRows = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  const plan = planRows[0];
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const existingRows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.clientId, plan.clientId),
        eq(subscriptions.status, "active"),
      ),
    )
    .limit(1);
  const existing = existingRows[0];

  if (existing) {
    return NextResponse.json(existing);
  }

  const nowIso = new Date().toISOString();
  const periodEndIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const subscription = {
    id: uuidv4(),
    userId,
    clientId: plan.clientId,
    planId,
    status: "active",
    currentPeriodStart: nowIso,
    currentPeriodEnd: periodEndIso,
    createdAt: nowIso,
    cancelledAt: null,
  };

  const result = await db.transaction(async (tx) => {
    // Re-check inside transaction to reduce the TOCTOU window
    const recheck = await tx
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.clientId, plan.clientId),
          eq(subscriptions.status, "active"),
        ),
      )
      .limit(1);
    if (recheck[0]) {
      return { row: recheck[0], isNew: false };
    }
    await tx.insert(subscriptions).values(subscription);
    return { row: subscription, isNew: true };
  });

  if (!result.isNew) {
    return NextResponse.json(result.row);
  }
  return NextResponse.json(result.row, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const subscriptionId = searchParams.get("subscriptionId");
  if (!subscriptionId) {
    return NextResponse.json({ error: "subscriptionId is required" }, { status: 400 });
  }

  const existingDelRows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.userId, userId),
      ),
    )
    .limit(1);
  const existing = existingDelRows[0];

  if (!existing) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  await db
    .update(subscriptions)
    .set({
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
    })
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, userId)));

  return NextResponse.json({ success: true });
}

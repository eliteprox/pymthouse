import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { adminInvites, users } from "@/db/schema";
import { eq, and, isNull, gt } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as Record<string, unknown>)?.role as string;
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const userId = (session.user as Record<string, unknown>)?.id as string;
  const code = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await db.insert(adminInvites).values({
    id: uuidv4(),
    code,
    createdBy: userId,
    expiresAt,
  });

  return NextResponse.json({ code, expiresAt });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as Record<string, unknown>)?.role as string;
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const invites = await db
    .select()
    .from(adminInvites)
    .where(
      and(
        isNull(adminInvites.usedBy),
        gt(adminInvites.expiresAt, new Date().toISOString())
      )
    );

  return NextResponse.json({ invites });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as Record<string, unknown>)?.id as string;
  const body = await req.json();
  const { code } = body;

  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Invite code required" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    // Atomically claim the invite: only succeeds if still unused and not expired
    const claimed = await tx
      .update(adminInvites)
      .set({ usedBy: userId })
      .where(
        and(
          eq(adminInvites.code, code),
          isNull(adminInvites.usedBy),
          gt(adminInvites.expiresAt, new Date().toISOString())
        )
      )
      .returning({ id: adminInvites.id });

    if (claimed.length === 0) {
      return { error: "Invalid or expired invite code" };
    }

    // Upgrade user to admin
    await tx.update(users).set({ role: "admin" }).where(eq(users.id, userId));

    return { success: true };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, role: "admin" });
}

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

  db.insert(adminInvites)
    .values({
      id: uuidv4(),
      code,
      createdBy: userId,
      expiresAt,
    })
    .run();

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

  const invites = db
    .select()
    .from(adminInvites)
    .where(
      and(
        isNull(adminInvites.usedBy),
        gt(adminInvites.expiresAt, new Date().toISOString())
      )
    )
    .all();

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

  const invite = db
    .select()
    .from(adminInvites)
    .where(
      and(
        eq(adminInvites.code, code),
        isNull(adminInvites.usedBy),
        gt(adminInvites.expiresAt, new Date().toISOString())
      )
    )
    .get();

  if (!invite) {
    return NextResponse.json({ error: "Invalid or expired invite code" }, { status: 400 });
  }

  // Upgrade user to admin
  db.update(users)
    .set({ role: "admin" })
    .where(eq(users.id, userId))
    .run();

  // Mark invite as used
  db.update(adminInvites)
    .set({ usedBy: userId })
    .where(eq(adminInvites.id, invite.id))
    .run();

  return NextResponse.json({ success: true, role: "admin" });
}

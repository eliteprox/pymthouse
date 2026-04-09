import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/db/index";
import { providerAdmins, users } from "@/db/schema";
import { getAuthorizedProviderApp } from "@/lib/provider-apps";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getAuthorizedProviderApp(id);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const memberships = await db
    .select()
    .from(providerAdmins)
    .where(eq(providerAdmins.clientId, id));
  const adminUsers = await db.select().from(users);
  return NextResponse.json({
    admins: memberships.map((membership) => ({
      ...membership,
      user: adminUsers.find((user) => user.id === membership.userId) || null,
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getAuthorizedProviderApp(id);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const userId = String(body.userId || "").trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const existingRows = await db
    .select()
    .from(providerAdmins)
    .where(
      and(
        eq(providerAdmins.clientId, id),
        eq(providerAdmins.userId, userId),
      ),
    )
    .limit(1);
  const existing = existingRows[0];

  if (existing) {
    return NextResponse.json(existing);
  }

  const membership = {
    id: uuidv4(),
    userId,
    clientId: id,
    role: body.role || "admin",
    createdAt: new Date().toISOString(),
  };

  await db.insert(providerAdmins).values(membership);
  return NextResponse.json(membership, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getAuthorizedProviderApp(id);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  await db.delete(providerAdmins).where(
    and(
      eq(providerAdmins.clientId, id),
      eq(providerAdmins.userId, userId),
    ),
  );

  return NextResponse.json({ success: true });
}

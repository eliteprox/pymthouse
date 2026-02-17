import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { sessions, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, revokeSession, authenticateRequest, hasScope } from "@/lib/auth";

/**
 * POST /api/v1/tokens -- Issue a new bearer token (scoped to an end user or admin)
 */
export async function POST(request: NextRequest) {
  const admin = await getAdminUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const scopes = body.scopes || "gateway";
  const expiresInDays = body.expiresInDays || 90;
  const endUserId = body.endUserId || undefined;
  const label = body.label || undefined;

  const validScopes = ["admin", "gateway", "read"];
  const scopeList = scopes.split(",").map((s: string) => s.trim());
  for (const scope of scopeList) {
    if (!validScopes.includes(scope)) {
      return NextResponse.json(
        { error: `Invalid scope: ${scope}` },
        { status: 400 }
      );
    }
  }

  if (scopeList.includes("admin") && admin.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can issue admin-scoped tokens" },
      { status: 403 }
    );
  }

  const { sessionId, token } = createSession({
    userId: admin.id,
    endUserId,
    label,
    scopes,
    expiresInDays,
  });

  return NextResponse.json({
    sessionId,
    token,
    scopes,
    endUserId: endUserId || null,
    expiresInDays,
    message: "Store this token securely. It will not be shown again.",
  });
}

/**
 * GET /api/v1/tokens -- List active tokens
 */
export async function GET(request: NextRequest) {
  const admin = await getAdminUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allSessions = db
    .select({
      id: sessions.id,
      label: sessions.label,
      endUserId: sessions.endUserId,
      scopes: sessions.scopes,
      expiresAt: sessions.expiresAt,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .all();

  return NextResponse.json({ tokens: allSessions });
}

/**
 * DELETE /api/v1/tokens -- Revoke a token
 */
export async function DELETE(request: NextRequest) {
  const admin = await getAdminUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!body.sessionId) {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 }
    );
  }

  revokeSession(body.sessionId);
  return NextResponse.json({ message: "Token revoked" });
}

async function getAdminUser(request: NextRequest) {
  const oauthSession = await getServerSession(authOptions);
  if (oauthSession?.user) {
    const sessionUser = oauthSession.user as Record<string, unknown>;
    if (sessionUser.id) {
      return db
        .select()
        .from(users)
        .where(eq(users.id, sessionUser.id as string))
        .get();
    }
  }

  const auth = authenticateRequest(request);
  if (auth && hasScope(auth.scopes, "admin") && auth.userId) {
    return db.select().from(users).where(eq(users.id, auth.userId)).get();
  }

  return null;
}

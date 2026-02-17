import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { users, transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authenticateRequest, hasScope } from "@/lib/auth";
import { getTransactions } from "@/lib/billing";

export async function GET(request: NextRequest) {
  const admin = await getAdminUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const endUserId = url.searchParams.get("endUserId");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const recentTransactions = getTransactions(
    endUserId || undefined,
    limit,
    offset
  );

  return NextResponse.json({
    transactions: recentTransactions,
    pagination: { limit, offset, hasMore: recentTransactions.length === limit },
  });
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
  if (auth && hasScope(auth.scopes, "read") && auth.userId) {
    return db.select().from(users).where(eq(users.id, auth.userId)).get();
  }

  return null;
}

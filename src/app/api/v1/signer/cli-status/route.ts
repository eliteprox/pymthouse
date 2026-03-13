import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authenticateRequest, hasScope } from "@/lib/auth";
import { fetchSignerCliStatus } from "@/lib/signer-cli";

/**
 * GET /api/v1/signer/cli-status
 *
 * Returns live state from go-livepeer's CLI port (4935), the same data
 * that livepeer_cli reads. Admin-only.
 */
export async function GET(request: NextRequest) {
  const admin = await getAdminUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await fetchSignerCliStatus();
  return NextResponse.json(status);
}

async function getAdminUser(request: NextRequest) {
  const oauthSession = await getServerSession(authOptions);
  if (oauthSession?.user) {
    const sessionUser = oauthSession.user as Record<string, unknown>;
    if (sessionUser.id) {
      const user = db
        .select()
        .from(users)
        .where(eq(users.id, sessionUser.id as string))
        .get();
      if (user?.role !== "admin") return null;
      return user;
    }
  }

  const auth = authenticateRequest(request);
  if (auth && hasScope(auth.scopes, "admin") && auth.userId) {
    const user = db
      .select()
      .from(users)
      .where(eq(users.id, auth.userId))
      .get();
    if (user?.role !== "admin") return null;
    return user;
  }

  return null;
}

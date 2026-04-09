import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authenticateRequest, hasScope } from "@/lib/auth";
import { isMetricsEnabled, reportMetrics, collectMetrics } from "@/lib/metrics";

export async function POST(request: NextRequest) {
  const admin = await getAdminUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isMetricsEnabled()) {
    return NextResponse.json(
      { error: "NaaP metrics not configured" },
      { status: 400 }
    );
  }

  const success = await reportMetrics();
  return NextResponse.json({ success });
}

export async function GET(request: NextRequest) {
  const admin = await getAdminUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await collectMetrics();
  return NextResponse.json({
    metricsEnabled: isMetricsEnabled(),
    preview: payload,
  });
}

async function getAdminUser(request: NextRequest) {
  const oauthSession = await getServerSession(authOptions);
  if (oauthSession?.user) {
    const sessionUser = oauthSession.user as Record<string, unknown>;
    if (sessionUser.id) {
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.id, sessionUser.id as string))
        .limit(1);
      return rows[0];
    }
  }

  const auth = await authenticateRequest(request);
  if (auth && hasScope(auth.scopes, "admin") && auth.userId) {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);
    return rows[0];
  }

  return null;
}

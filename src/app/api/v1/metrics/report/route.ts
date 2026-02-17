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

  const payload = collectMetrics();
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

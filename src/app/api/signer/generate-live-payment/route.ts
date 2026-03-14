import { NextRequest, NextResponse } from "next/server";
import { authenticateRequestAsync, hasScope, AuthError } from "@/lib/auth";
import { proxyGenerateLivePayment } from "@/lib/signer-proxy";
import { db } from "@/db/index";
import { developerApps } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestAsync(request);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized: invalid or expired token" },
        { status: 401 }
      );
    }

    if (!hasScope(auth.scopes, "gateway")) {
      return NextResponse.json(
        { error: "Forbidden: requires 'gateway' scope" },
        { status: 403 }
      );
    }

    // If the token is scoped to a developer app, verify it is approved
    if (auth.appId) {
      const app = db
        .select({ status: developerApps.status })
        .from(developerApps)
        .where(eq(developerApps.id, auth.appId))
        .get();

      if (!app || app.status !== "approved") {
        return NextResponse.json(
          { error: "Forbidden: app is not approved for signer access" },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const result = await proxyGenerateLivePayment(body, auth);

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[api] generate-live-payment error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

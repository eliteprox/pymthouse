import { NextRequest, NextResponse } from "next/server";
import { authenticateRequestAsync, hasScope, AuthError } from "@/lib/auth";
import { proxyGenerateLivePayment } from "@/lib/signer-proxy";
import { db } from "@/db/index";
import { developerApps, oidcClients } from "@/db/schema";
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

    if (!hasScope(auth.scopes, "sign:job")) {
      return NextResponse.json(
        {
          error: "insufficient_scope",
          error_description: "sign:job scope is required",
        },
        { status: 403 }
      );
    }

    // Enforce developer app approval before proxying.
    // Tokens without an appId (e.g. direct admin tokens) bypass this check.
    if (auth.appId) {
      const trimmed = auth.appId.trim();
      const fields = {
        id: developerApps.id,
        status: developerApps.status,
        ownerId: developerApps.ownerId,
      };
      const rows = await db
        .select(fields)
        .from(developerApps)
        .innerJoin(
          oidcClients,
          eq(developerApps.oidcClientId, oidcClients.id),
        )
        .where(eq(oidcClients.clientId, trimmed))
        .limit(1);
      const app = rows[0] ?? null;

      if (app && app.status !== "approved") {
        if (auth.userId !== app.ownerId) {
          return NextResponse.json(
            {
              error: "app_not_approved",
              error_description:
                "This application has not been approved and cannot process live payments",
            },
            { status: 403 },
          );
        }
        // App owner may test their own unapproved app; log for usage tracking.
        console.warn(
          `[api] generate-live-payment: unapproved app ${app.id} accessed by owner ${auth.userId} (status: ${app.status})`,
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

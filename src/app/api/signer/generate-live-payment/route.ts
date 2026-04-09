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

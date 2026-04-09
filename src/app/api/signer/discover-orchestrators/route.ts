import { NextRequest, NextResponse } from "next/server";
import { authenticateRequestAsync, hasScope, AuthError } from "@/lib/auth";
import { proxyDiscoverOrchestrators } from "@/lib/signer-proxy";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestAsync(request);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized: invalid or expired token" },
        { status: 401 }
      );
    }

    if (!hasScope(auth.scopes, "discover:orchestrators")) {
      return NextResponse.json(
        {
          error: "insufficient_scope",
          error_description: "discover:orchestrators scope is required",
        },
        { status: 403 }
      );
    }

    const result = await proxyDiscoverOrchestrators(auth);

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[api] discover-orchestrators error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

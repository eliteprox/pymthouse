import { NextRequest, NextResponse } from "next/server";
import { authenticateRequestAsync, hasScope, AuthError } from "@/lib/auth";
import { proxySignOrchestratorInfo } from "@/lib/signer-proxy";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestAsync(request);
    // DEBUG: remove after fixing 403
    console.log("[DEBUG sign-orch-info] auth result:", JSON.stringify(auth ? { userId: auth.userId, appId: auth.appId, scopes: auth.scopes, sessionId: auth.sessionId?.slice(0,12) } : null));
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized: invalid or expired token" },
        { status: 401 }
      );
    }

    if (!hasScope(auth.scopes, "gateway")) {
      console.log("[DEBUG sign-orch-info] hasScope('gateway') = false, scopes =", JSON.stringify(auth.scopes));
      return NextResponse.json(
        { error: "Forbidden: requires 'gateway' scope" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = await proxySignOrchestratorInfo(body, auth);

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[api] sign-orchestrator-info error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

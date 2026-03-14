/**
 * @deprecated This endpoint is deprecated in favor of OIDC /api/v1/oidc/token.
 * It will be removed in a future release. Set LEGACY_NAAP_LINK_ENABLED=false to disable.
 */

import { NextRequest, NextResponse } from "next/server";
import { createSession, hasScope, validateBearerToken } from "@/lib/auth";

const LEGACY_ENABLED = process.env.LEGACY_NAAP_LINK_ENABLED !== "false";

export async function POST(request: NextRequest) {
  if (!LEGACY_ENABLED) {
    return NextResponse.json(
      {
        error: "deprecated",
        message: "This endpoint is deprecated. Use OIDC /api/v1/oidc/token instead.",
      },
      { status: 410 }
    );
  }

  console.warn("[DEPRECATED] /api/v1/naap/exchange is deprecated. Use OIDC /api/v1/oidc/token instead.");

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bootstrapToken = authHeader.slice("Bearer ".length);
  const auth = validateBearerToken(bootstrapToken);
  if (!auth || !auth.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasScope(auth.scopes, "gateway")) {
    return NextResponse.json(
      { error: "Forbidden: requires gateway scope" },
      { status: 403 }
    );
  }

  const { token } = createSession({
    userId: auth.userId,
    scopes: "gateway",
    label: "naap_linked",
    expiresInDays: 90,
  });

  return NextResponse.json({
    api_key: token,
    token_type: "Bearer",
    expires_in_days: 90,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { createSession, hasScope, validateBearerToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
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

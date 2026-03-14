import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAccessToken } from "@/lib/oidc/tokens";

function errorResponse(
  error: string,
  description: string,
  status: number = 401
): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    {
      status,
      headers: {
        "WWW-Authenticate": `Bearer error="${error}", error_description="${description}"`,
      },
    }
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("invalid_token", "Missing or invalid Authorization header");
  }

  const accessToken = authHeader.slice(7);
  const payload = await verifyAccessToken(accessToken);

  if (!payload) {
    return errorResponse("invalid_token", "Invalid or expired access token");
  }

  const userId = payload.sub;
  if (!userId) {
    return errorResponse("invalid_token", "Token missing subject claim");
  }

  const user = db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!user) {
    return errorResponse("invalid_token", "User not found", 404);
  }

  // Parse scopes from token
  const scopes = (payload.scope as string || "").split(" ");

  // Build userinfo response based on granted scopes
  const userinfo: Record<string, unknown> = {
    sub: user.id,
  };

  if (scopes.includes("email")) {
    userinfo.email = user.email;
  }

  if (scopes.includes("profile")) {
    userinfo.name = user.name;
  }

  // Always include role for authorization decisions
  userinfo.role = user.role;

  // Plan/entitlements would be looked up from user's subscription
  // For now, derive from role
  if (scopes.includes("plan")) {
    userinfo.plan = user.role === "admin" ? "enterprise" : "free";
  }

  if (scopes.includes("entitlements")) {
    userinfo.entitlements = user.role === "admin"
      ? ["transcode", "ai-inference", "live-streaming", "admin"]
      : ["transcode", "ai-inference"];
  }

  return NextResponse.json(userinfo, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return GET(request);
}

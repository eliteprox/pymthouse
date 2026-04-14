/**
 * @deprecated This endpoint is deprecated in favor of OIDC /api/v1/oidc/authorize.
 * It will be removed in a future release. Set LEGACY_NAAP_LINK_ENABLED=false to disable.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  authenticateRequest,
  createShortLivedSession,
  hasScope,
} from "@/lib/auth";

const LEGACY_ENABLED = process.env.LEGACY_NAAP_LINK_ENABLED !== "false";
const ALLOWED_REDIRECT_PREFIX = "/api/v1/auth/providers/";

function getSingleParam(
  searchParams: URLSearchParams,
  key: string
): string | null {
  const value = searchParams.get(key);
  return value && value.trim() ? value : null;
}

function isAllowedNaapCallbackUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const isLocalhost =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "0.0.0.0";
    return isLocalhost && parsed.pathname.startsWith(ALLOWED_REDIRECT_PREFIX);
  } catch {
    return false;
  }
}

function buildRedirectUrl(baseUrl: string, token: string, state: string): string {
  const redirect = new URL(baseUrl);
  redirect.searchParams.set("token", token);
  redirect.searchParams.set("state", state);
  return redirect.toString();
}

async function getAuthenticatedAdminUserId(
  request: NextRequest
): Promise<string | null> {
  const oauthSession = await getServerSession(authOptions);
  if (oauthSession?.user) {
    const sessionUser = oauthSession.user as Record<string, unknown>;
    if (sessionUser.id && typeof sessionUser.id === "string" && sessionUser.role === "admin") {
      return sessionUser.id;
    }
  }

  const auth = await authenticateRequest(request);
  if (!auth || !hasScope(auth.scopes, "admin") || !auth.userId) {
    return null;
  }

  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);
  const user = userRows[0];
  return user?.id || null;
}

export async function GET(request: NextRequest) {
  if (!LEGACY_ENABLED) {
    return NextResponse.json(
      {
        error: "deprecated",
        message: "This endpoint is deprecated. Use OIDC /api/v1/oidc/authorize instead.",
      },
      { status: 410 }
    );
  }

  console.warn("[DEPRECATED] /api/v1/naap/auth is deprecated. Use OIDC /api/v1/oidc/authorize instead.");

  const redirectUrl = getSingleParam(request.nextUrl.searchParams, "redirect_url");
  const state = getSingleParam(request.nextUrl.searchParams, "state");

  if (!redirectUrl || !state) {
    return NextResponse.json(
      { error: "redirect_url and state are required" },
      { status: 400 }
    );
  }

  if (!isAllowedNaapCallbackUrl(redirectUrl)) {
    return NextResponse.json(
      { error: "redirect_url must target a localhost NaaP callback route" },
      { status: 400 }
    );
  }

  const userId = await getAuthenticatedAdminUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await createShortLivedSession({
    userId,
    scopes: "gateway",
    label: "naap_link_bootstrap",
    expiresInMinutes: 5,
  });

  return NextResponse.redirect(buildRedirectUrl(redirectUrl, token, state), {
    status: 302,
  });
}

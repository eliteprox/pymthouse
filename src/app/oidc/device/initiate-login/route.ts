import { NextRequest, NextResponse } from "next/server";
import {
  THIRD_PARTY_INITIATE_SKIP_COOKIE,
  buildInitiateLoginRedirectUrl,
  initiateSkipCookieOptions,
} from "@/lib/oidc/third-party-initiate-login";
import { getIssuer } from "@/lib/oidc/tokens";

/**
 * Server redirect to the RP's `initiate_login_uri` with OIDC third-party login parameters.
 * Sets a short-lived cookie so we only do this once per browser session (avoids redirect loops).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl;
  const initiateLoginUri = url.searchParams.get("initiate_login_uri");
  const targetLinkUri = url.searchParams.get("target_link_uri");
  const loginHint = url.searchParams.get("login_hint");

  if (!initiateLoginUri?.trim() || !targetLinkUri?.trim()) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "initiate_login_uri and target_link_uri are required" },
      { status: 400 },
    );
  }

  let dest: string;
  try {
    dest = buildInitiateLoginRedirectUrl(initiateLoginUri.trim(), {
      iss: getIssuer(),
      target_link_uri: targetLinkUri.trim(),
      login_hint: loginHint,
    });
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "invalid initiate_login_uri" },
      { status: 400 },
    );
  }

  const res = NextResponse.redirect(dest, 302);
  res.cookies.set(THIRD_PARTY_INITIATE_SKIP_COOKIE, "1", initiateSkipCookieOptions());
  return res;
}

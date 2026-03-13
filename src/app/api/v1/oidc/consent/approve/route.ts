import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { oidcAuthCodes, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  getClient,
  validateRedirectUri,
  validateScopes,
} from "@/lib/oidc/clients";
import { generateAuthorizationCode } from "@/lib/oidc/tokens";
import {
  verifyConsentToken,
  getConsentCookieOptions,
  CONSENT_COOKIE_NAME,
  type ConsentPayload,
} from "@/lib/oidc/consent-token";

const AUTH_CODE_EXPIRY_SECONDS = 600; // 10 minutes

function errorResponse(
  redirectUri: string,
  error: string,
  errorDescription: string,
  state?: string
): NextResponse {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", errorDescription);
  if (state) url.searchParams.set("state", state);
  return NextResponse.redirect(url.toString(), { status: 302 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;

  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const scope = searchParams.get("scope");
  const state = searchParams.get("state");
  const nonce = searchParams.get("nonce");
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod =
    searchParams.get("code_challenge_method") || "S256";

  if (!clientId || !redirectUri || !scope || !state) {
    return NextResponse.redirect(
      new URL("/oidc/consent?error=missing_params", request.nextUrl.origin),
      { status: 302 }
    );
  }

  const payload: ConsentPayload = {
    clientId,
    redirectUri,
    scope,
    state,
    nonce: nonce || null,
    codeChallenge: codeChallenge || null,
    codeChallengeMethod: codeChallengeMethod || null,
  };

  const cookieStore = await cookies();
  const consentCookie = cookieStore.get(CONSENT_COOKIE_NAME);
  if (!consentCookie?.value || !verifyConsentToken(consentCookie.value, payload)) {
    // Cookie missing/invalid - restart flow via authorize so it sets the cookie
    const authParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      state,
    });
    if (nonce) authParams.set("nonce", nonce);
    if (codeChallenge) authParams.set("code_challenge", codeChallenge);
    if (codeChallengeMethod) authParams.set("code_challenge_method", codeChallengeMethod);
    return NextResponse.redirect(
      new URL(`/api/v1/oidc/authorize?${authParams.toString()}`, request.nextUrl.origin),
      { status: 302 }
    );
  }

  const client = getClient(clientId);
  if (!client) {
    return errorResponse(
      redirectUri,
      "invalid_client",
      "Unknown client_id",
      state
    );
  }

  if (!validateRedirectUri(clientId, redirectUri)) {
    return errorResponse(
      redirectUri,
      "invalid_request",
      "redirect_uri is not registered for this client",
      state
    );
  }

  if (!scope.includes("openid")) {
    return errorResponse(redirectUri, "invalid_scope", "scope must include openid", state);
  }

  if (client.tokenEndpointAuthMethod === "none") {
    if (!codeChallenge) {
      return errorResponse(
        redirectUri,
        "invalid_request",
        "code_challenge is required for public clients (PKCE)",
        state
      );
    }
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    const authParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
    });
    if (nonce) authParams.set("nonce", nonce);
    if (codeChallenge) authParams.set("code_challenge", codeChallenge);
    if (codeChallengeMethod) authParams.set("code_challenge_method", codeChallengeMethod);
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${encodeURIComponent(`/api/v1/oidc/consent/approve?${authParams.toString()}`)}`, request.nextUrl.origin),
      { status: 302 }
    );
  }

  const sessionUser = session.user as Record<string, unknown>;
  const userId = sessionUser.id as string | undefined;
  if (!userId) {
    return errorResponse(
      redirectUri,
      "server_error",
      "User session is invalid",
      state
    );
  }

  const user = db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!user) {
    return errorResponse(redirectUri, "server_error", "User not found", state);
  }

  const requestedScopes = scope.split(/\s+/).filter(Boolean);
  const allowedScopes = validateScopes(clientId, requestedScopes);
  if (!allowedScopes.includes("openid")) {
    return errorResponse(
      redirectUri,
      "invalid_scope",
      "openid scope is not allowed for this client",
      state
    );
  }

  const code = generateAuthorizationCode();
  const expiresAt = new Date(
    Date.now() + AUTH_CODE_EXPIRY_SECONDS * 1000
  ).toISOString();

  db.insert(oidcAuthCodes)
    .values({
      id: uuidv4(),
      code,
      clientId,
      userId,
      scopes: allowedScopes.join(" "),
      nonce: nonce || null,
      codeChallenge: codeChallenge || null,
      codeChallengeMethod: codeChallenge ? codeChallengeMethod : null,
      redirectUri,
      expiresAt,
    })
    .run();

  const callbackUrl = new URL(redirectUri);
  callbackUrl.searchParams.set("code", code);
  callbackUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(callbackUrl.toString(), { status: 302 });
  const { options } = getConsentCookieOptions();
  res.cookies.set(CONSENT_COOKIE_NAME, "", {
    ...options,
    maxAge: 0,
  });
  return res;
}

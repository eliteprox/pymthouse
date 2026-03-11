import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { oidcAuthCodes, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getClient, validateRedirectUri, validateScopes } from "@/lib/oidc/clients";
import { generateAuthorizationCode } from "@/lib/oidc/tokens";

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

function jsonError(error: string, description: string, status: number): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    { status }
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;

  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const responseType = searchParams.get("response_type");
  const scope = searchParams.get("scope");
  const state = searchParams.get("state");
  const nonce = searchParams.get("nonce");
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method") || "S256";

  // Validate required parameters
  if (!clientId) {
    return jsonError("invalid_request", "client_id is required", 400);
  }

  const client = getClient(clientId);
  if (!client) {
    return jsonError("invalid_client", "Unknown client_id", 400);
  }

  if (!redirectUri) {
    return jsonError("invalid_request", "redirect_uri is required", 400);
  }

  if (!validateRedirectUri(clientId, redirectUri)) {
    return jsonError(
      "invalid_request",
      "redirect_uri is not registered for this client",
      400
    );
  }

  if (responseType !== "code") {
    return errorResponse(
      redirectUri,
      "unsupported_response_type",
      "Only response_type=code is supported",
      state || undefined
    );
  }

  if (!scope || !scope.includes("openid")) {
    return errorResponse(
      redirectUri,
      "invalid_scope",
      "scope must include openid",
      state || undefined
    );
  }

  if (!state) {
    return errorResponse(
      redirectUri,
      "invalid_request",
      "state is required",
      undefined
    );
  }

  // Validate PKCE for public clients
  if (client.tokenEndpointAuthMethod === "none") {
    if (!codeChallenge) {
      return errorResponse(
        redirectUri,
        "invalid_request",
        "code_challenge is required for public clients (PKCE)",
        state
      );
    }
    if (codeChallengeMethod !== "S256" && codeChallengeMethod !== "plain") {
      return errorResponse(
        redirectUri,
        "invalid_request",
        "code_challenge_method must be S256 or plain",
        state
      );
    }
  }

  // Check if user is authenticated
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    // Redirect to login with return URL
    const returnUrl = request.nextUrl.toString();
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", returnUrl);
    return NextResponse.redirect(loginUrl.toString(), { status: 302 });
  }

  // Get user ID from session
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

  // Verify user exists
  const user = db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!user) {
    return errorResponse(
      redirectUri,
      "server_error",
      "User not found",
      state
    );
  }

  // Validate and filter scopes
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

  // Check for prompt=none (skip consent) or auto-approve for trusted clients
  const prompt = searchParams.get("prompt");
  const skipConsent = prompt === "none" || client.clientId === "naap";

  if (!skipConsent) {
    // Redirect to consent page
    const consentUrl = new URL("/oidc/consent", request.nextUrl.origin);
    consentUrl.searchParams.set("client_id", clientId);
    consentUrl.searchParams.set("redirect_uri", redirectUri);
    consentUrl.searchParams.set("scope", allowedScopes.join(" "));
    consentUrl.searchParams.set("state", state);
    if (nonce) consentUrl.searchParams.set("nonce", nonce);
    if (codeChallenge) {
      consentUrl.searchParams.set("code_challenge", codeChallenge);
      consentUrl.searchParams.set("code_challenge_method", codeChallengeMethod);
    }
    return NextResponse.redirect(consentUrl.toString(), { status: 302 });
  }

  // Generate authorization code
  const code = generateAuthorizationCode();
  const expiresAt = new Date(Date.now() + AUTH_CODE_EXPIRY_SECONDS * 1000).toISOString();

  // Store authorization code
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

  // Redirect back to client with code
  const callbackUrl = new URL(redirectUri);
  callbackUrl.searchParams.set("code", code);
  callbackUrl.searchParams.set("state", state);

  return NextResponse.redirect(callbackUrl.toString(), { status: 302 });
}

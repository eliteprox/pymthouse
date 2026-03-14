import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { oidcAuthCodes, oidcDeviceCodes, oidcRefreshTokens, users } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  getClient,
  validateClientSecret,
} from "@/lib/oidc/clients";
import {
  mintIdToken,
  mintAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  verifyPKCE,
} from "@/lib/oidc/tokens";

function errorResponse(
  error: string,
  description: string,
  status: number = 400
): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function derivePlanAndEntitlements(role: string): { plan: string; entitlements: string[] } {
  switch (role) {
    case "admin":
      return {
        plan: "enterprise",
        entitlements: ["transcode", "ai-inference", "live-streaming", "admin", "unlimited-quota"],
      };
    case "operator":
      return {
        plan: "pro",
        entitlements: ["transcode", "ai-inference", "live-streaming"],
      };
    default:
      return {
        plan: "free",
        entitlements: ["transcode", "ai-inference"],
      };
  }
}

async function parseBody(
  request: NextRequest
): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  if (contentType.includes("application/json")) {
    return request.json();
  }

  throw new Error("Unsupported content type");
}

async function handleAuthorizationCodeGrant(
  body: Record<string, string>,
  clientId: string
): Promise<NextResponse> {
  const code = body.code;
  const redirectUri = body.redirect_uri;
  const codeVerifier = body.code_verifier;

  if (!code) {
    return errorResponse("invalid_request", "code is required");
  }

  if (!redirectUri) {
    return errorResponse("invalid_request", "redirect_uri is required");
  }

  // Find and validate auth code
  const now = new Date().toISOString();
  const authCode = db
    .select()
    .from(oidcAuthCodes)
    .where(
      and(
        eq(oidcAuthCodes.code, code),
        eq(oidcAuthCodes.clientId, clientId),
        gt(oidcAuthCodes.expiresAt, now)
      )
    )
    .get();

  if (!authCode) {
    return errorResponse("invalid_grant", "Invalid or expired authorization code");
  }

  if (authCode.consumedAt) {
    return errorResponse("invalid_grant", "Authorization code already used");
  }

  if (authCode.redirectUri !== redirectUri) {
    return errorResponse("invalid_grant", "redirect_uri mismatch");
  }

  // Verify PKCE if code_challenge was provided during authorization
  if (authCode.codeChallenge) {
    if (!codeVerifier) {
      return errorResponse(
        "invalid_request",
        "code_verifier is required for PKCE"
      );
    }

    const isValid = verifyPKCE(
      codeVerifier,
      authCode.codeChallenge,
      authCode.codeChallengeMethod || "S256"
    );

    if (!isValid) {
      return errorResponse("invalid_grant", "Invalid code_verifier");
    }
  }

  // Mark auth code as consumed
  db.update(oidcAuthCodes)
    .set({ consumedAt: now })
    .where(eq(oidcAuthCodes.id, authCode.id))
    .run();

  // Get user for token claims
  const user = db
    .select()
    .from(users)
    .where(eq(users.id, authCode.userId))
    .get();

  if (!user) {
    return errorResponse("server_error", "User not found", 500);
  }

  const scopes = authCode.scopes.split(" ");
  const { plan, entitlements } = derivePlanAndEntitlements(user.role);

  // Mint tokens with plan and entitlements claims when requested
  const idToken = await mintIdToken(clientId, {
    sub: user.id,
    email: scopes.includes("email") ? user.email : undefined,
    name: scopes.includes("profile") ? user.name || undefined : undefined,
    role: user.role,
    plan: scopes.includes("plan") ? plan : undefined,
    entitlements: scopes.includes("entitlements") ? entitlements : undefined,
    nonce: authCode.nonce || undefined,
  });

  const accessToken = await mintAccessToken(clientId, {
    sub: user.id,
    scopes,
  });

  // Generate refresh token if allowed
  const { token: refreshToken, hash: refreshTokenHash, expiresAt: refreshExpiresAt } =
    generateRefreshToken();

  db.insert(oidcRefreshTokens)
    .values({
      id: uuidv4(),
      tokenHash: refreshTokenHash,
      clientId,
      userId: user.id,
      scopes: authCode.scopes,
      expiresAt: refreshExpiresAt,
    })
    .run();

  return NextResponse.json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      id_token: idToken,
      refresh_token: refreshToken,
      scope: authCode.scopes,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

async function handleRefreshTokenGrant(
  body: Record<string, string>,
  clientId: string
): Promise<NextResponse> {
  const refreshToken = body.refresh_token;

  if (!refreshToken) {
    return errorResponse("invalid_request", "refresh_token is required");
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const now = new Date().toISOString();

  // Find and validate refresh token
  const storedToken = db
    .select()
    .from(oidcRefreshTokens)
    .where(
      and(
        eq(oidcRefreshTokens.tokenHash, tokenHash),
        eq(oidcRefreshTokens.clientId, clientId),
        gt(oidcRefreshTokens.expiresAt, now)
      )
    )
    .get();

  if (!storedToken) {
    return errorResponse("invalid_grant", "Invalid or expired refresh token");
  }

  if (storedToken.revokedAt) {
    return errorResponse("invalid_grant", "Refresh token has been revoked");
  }

  // Get user for token claims
  const user = db
    .select()
    .from(users)
    .where(eq(users.id, storedToken.userId))
    .get();

  if (!user) {
    return errorResponse("server_error", "User not found", 500);
  }

  const scopes = storedToken.scopes.split(" ");
  const { plan, entitlements } = derivePlanAndEntitlements(user.role);

  // Mint new tokens with refreshed plan/entitlements claims
  const idToken = await mintIdToken(clientId, {
    sub: user.id,
    email: scopes.includes("email") ? user.email : undefined,
    name: scopes.includes("profile") ? user.name || undefined : undefined,
    role: user.role,
    plan: scopes.includes("plan") ? plan : undefined,
    entitlements: scopes.includes("entitlements") ? entitlements : undefined,
  });

  const accessToken = await mintAccessToken(clientId, {
    sub: user.id,
    scopes,
  });

  // Rotate refresh token
  db.update(oidcRefreshTokens)
    .set({ revokedAt: now })
    .where(eq(oidcRefreshTokens.id, storedToken.id))
    .run();

  const { token: newRefreshToken, hash: newRefreshTokenHash, expiresAt: refreshExpiresAt } =
    generateRefreshToken();

  db.insert(oidcRefreshTokens)
    .values({
      id: uuidv4(),
      tokenHash: newRefreshTokenHash,
      clientId,
      userId: user.id,
      scopes: storedToken.scopes,
      expiresAt: refreshExpiresAt,
    })
    .run();

  return NextResponse.json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      id_token: idToken,
      refresh_token: newRefreshToken,
      scope: storedToken.scopes,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

async function handleDeviceCodeGrant(
  body: Record<string, string>,
  clientId: string
): Promise<NextResponse> {
  const deviceCode = body.device_code;

  if (!deviceCode) {
    return errorResponse("invalid_request", "device_code is required");
  }

  const now = new Date().toISOString();

  const stored = db
    .select()
    .from(oidcDeviceCodes)
    .where(
      and(
        eq(oidcDeviceCodes.deviceCode, deviceCode),
        eq(oidcDeviceCodes.clientId, clientId)
      )
    )
    .get();

  if (!stored) {
    return errorResponse("invalid_grant", "Unknown device code");
  }

  // Check expiry
  if (stored.expiresAt <= now) {
    db.update(oidcDeviceCodes)
      .set({ status: "expired" })
      .where(eq(oidcDeviceCodes.id, stored.id))
      .run();
    return errorResponse("expired_token", "The device code has expired");
  }

  // RFC 8628 error codes for polling
  if (stored.status === "pending") {
    return NextResponse.json(
      { error: "authorization_pending", error_description: "The user has not yet authorized the device" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (stored.status === "denied") {
    return errorResponse("access_denied", "The user denied the authorization request");
  }

  if (stored.status === "expired") {
    return errorResponse("expired_token", "The device code has expired");
  }

  if (stored.status !== "authorized" || !stored.userId) {
    return errorResponse("server_error", "Unexpected device code state", 500);
  }

  // Device code is authorized — issue tokens (one-time use: mark consumed)
  db.update(oidcDeviceCodes)
    .set({ status: "consumed" })
    .where(eq(oidcDeviceCodes.id, stored.id))
    .run();

  // Get user for token claims
  const user = db
    .select()
    .from(users)
    .where(eq(users.id, stored.userId))
    .get();

  if (!user) {
    return errorResponse("server_error", "User not found", 500);
  }

  const scopes = stored.scopes.split(" ");
  const { plan, entitlements } = derivePlanAndEntitlements(user.role);

  const idToken = await mintIdToken(clientId, {
    sub: user.id,
    email: scopes.includes("email") ? user.email : undefined,
    name: scopes.includes("profile") ? user.name || undefined : undefined,
    role: user.role,
    plan: scopes.includes("plan") ? plan : undefined,
    entitlements: scopes.includes("entitlements") ? entitlements : undefined,
  });

  const accessToken = await mintAccessToken(clientId, {
    sub: user.id,
    scopes,
  });

  // Generate refresh token
  const { token: refreshToken, hash: refreshTokenHash, expiresAt: refreshExpiresAt } =
    generateRefreshToken();

  db.insert(oidcRefreshTokens)
    .values({
      id: uuidv4(),
      tokenHash: refreshTokenHash,
      clientId,
      userId: user.id,
      scopes: stored.scopes,
      expiresAt: refreshExpiresAt,
    })
    .run();

  return NextResponse.json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      id_token: idToken,
      refresh_token: refreshToken,
      scope: stored.scopes,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, string>;
  try {
    body = await parseBody(request);
  } catch {
    return errorResponse("invalid_request", "Invalid request body");
  }

  const grantType = body.grant_type;
  const clientId = body.client_id;
  const clientSecret = body.client_secret;

  if (!clientId) {
    return errorResponse("invalid_request", "client_id is required");
  }

  const client = getClient(clientId);
  if (!client) {
    return errorResponse("invalid_client", "Unknown client_id");
  }

  // Authenticate client if required
  if (client.tokenEndpointAuthMethod === "client_secret_post") {
    if (!clientSecret || !validateClientSecret(clientId, clientSecret)) {
      return errorResponse("invalid_client", "Invalid client credentials", 401);
    }
  } else if (client.tokenEndpointAuthMethod === "client_secret_basic") {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Basic ")) {
      return errorResponse("invalid_client", "Missing Basic auth header", 401);
    }

    try {
      const decoded = atob(authHeader.slice(6));
      const [headerClientId, headerClientSecret] = decoded.split(":");
      if (
        headerClientId !== clientId ||
        !validateClientSecret(clientId, headerClientSecret)
      ) {
        return errorResponse("invalid_client", "Invalid client credentials", 401);
      }
    } catch {
      return errorResponse("invalid_client", "Invalid Basic auth header", 401);
    }
  }

  // Handle grant types
  if (grantType === "authorization_code") {
    if (!client.grantTypes.includes("authorization_code")) {
      return errorResponse(
        "unauthorized_client",
        "Client not authorized for authorization_code grant"
      );
    }
    return handleAuthorizationCodeGrant(body, clientId);
  }

  if (grantType === "refresh_token") {
    if (!client.grantTypes.includes("refresh_token")) {
      return errorResponse(
        "unauthorized_client",
        "Client not authorized for refresh_token grant"
      );
    }
    return handleRefreshTokenGrant(body, clientId);
  }

  if (grantType === "urn:ietf:params:oauth:grant-type:device_code") {
    if (!client.grantTypes.includes("urn:ietf:params:oauth:grant-type:device_code")) {
      return errorResponse(
        "unauthorized_client",
        "Client not authorized for device_code grant"
      );
    }
    return handleDeviceCodeGrant(body, clientId);
  }

  return errorResponse("unsupported_grant_type", `Grant type ${grantType} is not supported`);
}

import * as jose from "jose";
import { db } from "@/db/index";
import { developerApps, oidcClients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateClientSecret } from "./clients";
import { ensureSigningKey } from "./jwks";
import { getIssuer } from "./tokens";
import { fetchPlatformJWKS } from "./jwks-fetch";
import { findOrCreateAppEndUser } from "@/lib/billing";

const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const JWT_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:jwt";
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";

export interface TokenExchangeResult {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  issued_token_type: string;
}

export function isTokenExchangeGrant(grantType: string): boolean {
  return grantType === TOKEN_EXCHANGE_GRANT;
}

export async function handleTokenExchange(params: {
  clientId: string;
  clientSecret: string;
  subjectToken: string;
  subjectTokenType: string;
  scope: string;
  resource?: string;
}): Promise<TokenExchangeResult> {
  const {
    clientId,
    clientSecret,
    subjectToken,
    subjectTokenType,
    scope,
  } = params;

  if (subjectTokenType !== JWT_TOKEN_TYPE) {
    throw new TokenExchangeError(
      "unsupported_token_type",
      `subject_token_type must be ${JWT_TOKEN_TYPE}`,
    );
  }

  if (!validateClientSecret(clientId, clientSecret)) {
    throw new TokenExchangeError("invalid_client", "Invalid client credentials");
  }

  const clientRow = db
    .select()
    .from(oidcClients)
    .where(eq(oidcClients.clientId, clientId))
    .get();
  if (!clientRow) {
    throw new TokenExchangeError("invalid_client", "Client not found");
  }

  const app = db
    .select()
    .from(developerApps)
    .where(eq(developerApps.oidcClientId, clientRow.id))
    .get();
  if (!app || app.status !== "approved") {
    throw new TokenExchangeError(
      "invalid_client",
      "App is not approved for token exchange",
    );
  }

  if (app.billingPattern !== "per_user") {
    throw new TokenExchangeError(
      "invalid_request",
      "Token exchange requires per_user billing pattern",
    );
  }

  if (!app.jwksUri) {
    throw new TokenExchangeError(
      "invalid_request",
      "App has no JWKS URI configured for token exchange",
    );
  }

  let platformJWKS: jose.JSONWebKeySet;
  try {
    platformJWKS = await fetchPlatformJWKS(app.jwksUri);
  } catch (err) {
    throw new TokenExchangeError(
      "invalid_request",
      `Failed to fetch platform JWKS: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }

  let payload: jose.JWTPayload;
  try {
    const keySet = jose.createLocalJWKSet(platformJWKS);
    const result = await jose.jwtVerify(subjectToken, keySet);
    payload = result.payload;
  } catch (err) {
    throw new TokenExchangeError(
      "invalid_grant",
      `Subject token verification failed: ${err instanceof Error ? err.message : "invalid signature"}`,
    );
  }

  const externalSub = payload.sub;
  if (!externalSub) {
    throw new TokenExchangeError(
      "invalid_grant",
      "Subject token missing sub claim",
    );
  }

  const { id: endUserId } = findOrCreateAppEndUser(clientId, externalSub);

  const requestedScopes = scope
    .split(/\s+/)
    .filter(Boolean);
  const allowedScopes = clientRow.allowedScopes.split(/[,\s]+/).filter(Boolean);
  const grantedScopes = requestedScopes.filter((s) => allowedScopes.includes(s));
  const scopeString = grantedScopes.join(" ") || "gateway";

  const issuer = getIssuer();
  const signingKey = await ensureSigningKey();
  const expiresIn = 3600;

  const accessToken = await new jose.SignJWT({
    client_id: clientId,
    scope: scopeString,
    gateway: scopeString.includes("gateway"),
    token_exchange: true,
  })
    .setProtectedHeader({ alg: "RS256", kid: signingKey.kid })
    .setSubject(endUserId)
    .setIssuer(issuer)
    .setAudience(issuer)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .setJti(`te_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`)
    .sign(signingKey.privateKey);

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
    scope: scopeString,
    issued_token_type: ACCESS_TOKEN_TYPE,
  };
}

export class TokenExchangeError extends Error {
  code: string;
  constructor(
    code: string,
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

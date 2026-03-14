import * as jose from "jose";
import { ensureSigningKey, getPublicJWKS } from "./jwks";

export const OIDC_MOUNT_PATH = "/api/v1/oidc";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function ensureHttpsForProduction(url: string): string {
  try {
    const u = new URL(url);
    const isLocalhost =
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname.startsWith("192.168.") ||
      u.hostname.endsWith(".local");
    if (!isLocalhost && u.protocol === "http:") {
      u.protocol = "https:";
      return u.toString();
    }
  } catch {
    /* ignore */
  }
  return url;
}

export function getPublicOrigin(): string {
  const raw = process.env.NEXTAUTH_URL || "http://localhost:3001";
  return trimTrailingSlash(ensureHttpsForProduction(raw));
}

export function getIssuer(): string {
  const configured =
    process.env.OIDC_ISSUER || process.env.NEXTAUTH_URL || "http://localhost:3001";
  const normalized = trimTrailingSlash(ensureHttpsForProduction(configured));
  return normalized.endsWith(OIDC_MOUNT_PATH)
    ? normalized
    : `${normalized}${OIDC_MOUNT_PATH}`;
}

/**
 * Verify a JWT access token issued by the OIDC provider.
 *
 * Validates the signature against the local JWKS, checks issuer, and
 * verifies the audience matches.
 */
export async function verifyAccessToken(
  token: string
): Promise<jose.JWTPayload | null> {
  try {
    const issuer = getIssuer();
    const jwks = await getPublicJWKS();
    const keySet = jose.createLocalJWKSet(jwks);

    const { payload } = await jose.jwtVerify(token, keySet, {
      issuer,
      audience: issuer,
    });

    return payload;
  } catch {
    return null;
  }
}

// ── Legacy minting helpers ──────────────────────────────────────────
// Kept for backward compatibility during migration. New tokens are issued
// by node-oidc-provider.  These will be removed once migration is complete.

const ID_TOKEN_EXPIRY = "1h";
const ACCESS_TOKEN_EXPIRY = "1h";

export interface IdTokenClaims {
  sub: string;
  email?: string;
  name?: string;
  role?: string;
  plan?: string;
  entitlements?: string[];
  nonce?: string;
}

export interface AccessTokenClaims {
  sub: string;
  scopes: string[];
}

/** @deprecated Use node-oidc-provider instead */
export async function mintIdToken(
  clientId: string,
  claims: IdTokenClaims
): Promise<string> {
  const keyPair = await ensureSigningKey();
  const issuer = getIssuer();

  const jwt = await new jose.SignJWT({
    ...claims,
    auth_time: Math.floor(Date.now() / 1000),
  })
    .setProtectedHeader({ alg: "RS256", kid: keyPair.kid, typ: "JWT" })
    .setIssuer(issuer)
    .setSubject(claims.sub)
    .setAudience(clientId)
    .setIssuedAt()
    .setExpirationTime(ID_TOKEN_EXPIRY)
    .sign(keyPair.privateKey);

  return jwt;
}

/** @deprecated Use node-oidc-provider instead */
export async function mintAccessToken(
  clientId: string,
  claims: AccessTokenClaims
): Promise<string> {
  const keyPair = await ensureSigningKey();
  const issuer = getIssuer();

  const jwt = await new jose.SignJWT({
    scope: claims.scopes.join(" "),
    client_id: clientId,
  })
    .setProtectedHeader({ alg: "RS256", kid: keyPair.kid, typ: "at+jwt" })
    .setIssuer(issuer)
    .setSubject(claims.sub)
    .setAudience(issuer)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .setJti(jose.base64url.encode(crypto.getRandomValues(new Uint8Array(16))))
    .sign(keyPair.privateKey);

  return jwt;
}

// ── Removed legacy helpers ──────────────────────────────────────────
// generateRefreshToken, hashRefreshToken, generateAuthorizationCode,
// generatePKCEChallenge, verifyPKCE — all now handled by node-oidc-provider.

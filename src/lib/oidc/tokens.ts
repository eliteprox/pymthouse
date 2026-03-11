import * as jose from "jose";
import { createHash, randomBytes } from "crypto";
import { ensureSigningKey, getPublicJWKS } from "./jwks";

const ID_TOKEN_EXPIRY = "1h";
const ACCESS_TOKEN_EXPIRY = "1h";
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

export function getIssuer(): string {
  return process.env.OIDC_ISSUER || process.env.NEXTAUTH_URL || "http://localhost:3001";
}

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
    .setJti(randomBytes(16).toString("hex"))
    .sign(keyPair.privateKey);

  return jwt;
}

export function generateRefreshToken(): { token: string; hash: string; expiresAt: string } {
  const token = `pmth_rt_${randomBytes(32).toString("hex")}`;
  const hash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  return { token, hash, expiresAt };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

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

export function generateAuthorizationCode(): string {
  return randomBytes(32).toString("hex");
}

export function generatePKCEChallenge(verifier: string, method: string): string {
  if (method === "plain") {
    return verifier;
  }
  // S256: BASE64URL(SHA256(verifier))
  const hash = createHash("sha256").update(verifier).digest();
  return jose.base64url.encode(hash);
}

export function verifyPKCE(
  codeVerifier: string,
  codeChallenge: string,
  codeChallengeMethod: string
): boolean {
  const computed = generatePKCEChallenge(codeVerifier, codeChallengeMethod);
  return computed === codeChallenge;
}

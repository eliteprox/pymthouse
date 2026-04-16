import { db } from "@/db/index";
import { sessions, oidcClients, developerApps } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import {
  createHash,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { v4 as uuidv4 } from "uuid";
import type { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/oidc/tokens";
import { validateClientSecret } from "@/lib/oidc/clients";

const TOKEN_PREFIX = "pmth_";
const DEBUG_OIDC_LOGS = process.env.OIDC_DEBUG_LOGS === "1";
const TOKEN_HASH_SCHEME = "pbkdf2_sha256";
const TOKEN_HASH_ITERATIONS = 210000;
const TOKEN_HASH_KEYLEN = 32;
const TOKEN_HASH_DIGEST = "sha256";

export function hashToken(token: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = pbkdf2Sync(
    token,
    salt,
    TOKEN_HASH_ITERATIONS,
    TOKEN_HASH_KEYLEN,
    TOKEN_HASH_DIGEST,
  ).toString("hex");
  return `${TOKEN_HASH_SCHEME}$${TOKEN_HASH_ITERATIONS}$${salt}$${derivedKey}`;
}

export function verifyTokenHash(token: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length === 4 && parts[0] === TOKEN_HASH_SCHEME) {
    const iterations = Number(parts[1]);
    const salt = parts[2];
    const expected = parts[3];
    if (!Number.isFinite(iterations) || iterations <= 0 || !salt || !expected) {
      return false;
    }

    const actual = pbkdf2Sync(
      token,
      salt,
      iterations,
      TOKEN_HASH_KEYLEN,
      TOKEN_HASH_DIGEST,
    ).toString("hex");

    const expectedBuf = Buffer.from(expected, "hex");
    const actualBuf = Buffer.from(actual, "hex");
    return (
      expectedBuf.length === actualBuf.length &&
      timingSafeEqual(expectedBuf, actualBuf)
    );
  }

  // Backward compatibility for existing stored SHA-256 hashes.
  const legacy = createHash("sha256").update(token).digest("hex");
  const legacyExpectedBuf = Buffer.from(storedHash, "hex");
  const legacyActualBuf = Buffer.from(legacy, "hex");
  return (
    legacyExpectedBuf.length === legacyActualBuf.length &&
    timingSafeEqual(legacyExpectedBuf, legacyActualBuf)
  );
}

export function generateBearerToken(): { token: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  const token = `${TOKEN_PREFIX}${raw}`;
  return { token, hash: hashToken(token) };
}

/**
 * Create a bearer token. Can be scoped to an admin user, an end user, or both.
 */
export async function createSession(opts: {
  userId?: string;
  endUserId?: string;
  appId?: string;
  label?: string;
  scopes?: string;
  expiresInDays?: number;
}): Promise<{ sessionId: string; token: string }> {
  const {
    userId,
    endUserId,
    appId,
    label,
    scopes = "sign:job",
    expiresInDays = 90,
  } = opts;

  return createSessionWithExpiryMs({
    userId,
    endUserId,
    appId,
    label,
    scopes,
    expiresInMs: expiresInDays * 24 * 60 * 60 * 1000,
  });
}

export async function createShortLivedSession(opts: {
  userId?: string;
  endUserId?: string;
  appId?: string;
  label?: string;
  scopes?: string;
  expiresInMinutes: number;
}): Promise<{ sessionId: string; token: string }> {
  const {
    userId,
    endUserId,
    appId,
    label,
    scopes = "sign:job",
    expiresInMinutes,
  } = opts;

  return createSessionWithExpiryMs({
    userId,
    endUserId,
    appId,
    label,
    scopes,
    expiresInMs: expiresInMinutes * 60 * 1000,
  });
}

async function createSessionWithExpiryMs(opts: {
  userId?: string;
  endUserId?: string;
  appId?: string;
  label?: string;
  scopes: string;
  expiresInMs: number;
}): Promise<{ sessionId: string; token: string }> {
  const { userId, endUserId, appId, label, scopes, expiresInMs } = opts;
  const safeExpiresInMs = Math.max(1, Math.floor(expiresInMs));

  const { token, hash } = generateBearerToken();
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + safeExpiresInMs).toISOString();

  await db.insert(sessions).values({
    id: sessionId,
    userId: userId || null,
    endUserId: endUserId || null,
    appId: appId || null,
    label: label || null,
    tokenHash: hash,
    scopes,
    expiresAt,
  });

  return { sessionId, token };
}

export async function revokeSession(sessionId: string): Promise<boolean> {
  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.id, sessionId))
    .returning({ id: sessions.id });
  return deleted.length > 0;
}

/**
 * Delete a session only if id, bearer token hash, and expiry still match.
 * Used to consume refresh tokens exactly once (two callers: one delete wins).
 */
export async function consumeSessionByIdAndToken(
  sessionId: string,
  token: string,
): Promise<AuthResult | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const hash = hashToken(token);
  const now = new Date().toISOString();

  const rows = await db
    .delete(sessions)
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.tokenHash, hash),
        gt(sessions.expiresAt, now),
      ),
    )
    .returning();

  const row = rows[0];
  if (!row) return null;

  return {
    userId: row.userId,
    endUserId: row.endUserId,
    appId: row.appId || null,
    sessionId: row.id,
    label: row.label || null,
    scopes: row.scopes,
    tokenHash: hash,
  };
}

export interface AuthResult {
  userId: string | null;
  endUserId: string | null;
  appId: string | null;
  sessionId: string;
  label?: string | null;
  scopes: string;
  tokenHash: string;
}

/**
 * Validate a bearer token. Returns auth info including which end user
 * (if any) the token is scoped to.
 */
export async function validateBearerToken(token: string): Promise<AuthResult | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const hash = hashToken(token);
  const now = new Date().toISOString();

  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hash), gt(sessions.expiresAt, now)))
    .limit(1);
  const session = rows[0];

  if (!session) return null;

  return {
    userId: session.userId,
    endUserId: session.endUserId,
    appId: session.appId || null,
    sessionId: session.id,
    label: session.label || null,
    scopes: session.scopes,
    tokenHash: hash,
  };
}

export function hasScope(scopes: string, required: string): boolean {
  if (!scopes) return false;
  if (scopes === "admin") return true;
  return scopes
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(required);
}

export async function authenticateRequest(request: NextRequest): Promise<AuthResult | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  const sessionResult = await validateBearerToken(token);
  if (sessionResult) return sessionResult;

  return null;
}

/**
 * Authenticate a request, supporting both pmth_ session tokens and OIDC JWTs.
 */
export async function authenticateRequestAsync(request: NextRequest): Promise<AuthResult | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  const sessionResult = await validateBearerToken(token);
  if (sessionResult) return sessionResult;

  const jwtPayload = await verifyAccessToken(token);
  if (!jwtPayload) {
    if (DEBUG_OIDC_LOGS) {
      const parts = token.split(".");
      const isJwtShaped = parts.length === 3;
      console.warn(
        "[OIDC] bearer token rejected by JWT verifier:",
        isJwtShaped ? "JWT signature/issuer/audience mismatch" : "not a JWT (opaque token?)",
      );
    }
    return null;
  }

  const scopeFromScope =
    typeof jwtPayload.scope === "string" ? jwtPayload.scope : "";
  const scpRaw = (jwtPayload as Record<string, unknown>).scp;
  const scopeFromScp =
    Array.isArray(scpRaw)
      ? scpRaw.filter((v): v is string => typeof v === "string").join(" ")
      : typeof scpRaw === "string"
        ? scpRaw
        : "";
  const normalizedScopes = (scopeFromScope || scopeFromScp)
    .trim()
    .replace(/\s+/g, ",");
  const effectiveScopes = normalizedScopes;

  return {
    userId: typeof jwtPayload.sub === "string" ? jwtPayload.sub : null,
    endUserId: null,
    appId: typeof jwtPayload.client_id === "string" ? jwtPayload.client_id : null,
    sessionId: typeof jwtPayload.jti === "string" ? jwtPayload.jti : `jwt_${Date.now()}`,
    scopes: effectiveScopes,
    tokenHash: "",
  };
}

export async function requireAuth(
  request: NextRequest,
  requiredScope: string,
): Promise<AuthResult> {
  const auth = await authenticateRequest(request);
  if (!auth) {
    throw new AuthError("Unauthorized: invalid or expired token", 401);
  }
  if (!hasScope(auth.scopes, requiredScope)) {
    throw new AuthError(
      `Forbidden: requires '${requiredScope}' scope`,
      403,
    );
  }
  return auth;
}

/**
 * Authenticate a request using client credentials (Basic auth or JSON body).
 */
export async function authenticateAppClient(request: NextRequest): Promise<{
  clientId: string;
  appId: string;
  scopes: string;
} | null> {
  let clientId: string | null = null;
  let clientSecret: string | null = null;

  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
    const colonIdx = decoded.indexOf(":");
    if (colonIdx > 0) {
      clientId = decoded.slice(0, colonIdx);
      clientSecret = decoded.slice(colonIdx + 1);
    }
  }

  if (!clientId || !clientSecret) {
    return null;
  }

  if (!(await validateClientSecret(clientId, clientSecret))) {
    return null;
  }

  const clientRows = await db
    .select()
    .from(oidcClients)
    .where(eq(oidcClients.clientId, clientId))
    .limit(1);
  const clientRow = clientRows[0];
  if (!clientRow) return null;

  const appRows = await db
    .select()
    .from(developerApps)
    .where(eq(developerApps.oidcClientId, clientRow.id))
    .limit(1);
  const app = appRows[0];
  if (!app) return null;

  return { clientId, appId: clientId, scopes: clientRow.allowedScopes };
}

export class AuthError extends Error {
  status: number;
  constructor(
    message: string,
    status: number,
  ) {
    super(message);
    this.status = status;
  }
}

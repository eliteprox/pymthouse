import { db } from "@/db/index";
import { sessions, users } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";
import type { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/oidc/tokens";

const TOKEN_PREFIX = "pmth_";
const DEBUG_OIDC_LOGS = process.env.OIDC_DEBUG_LOGS === "1";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateBearerToken(): { token: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  const token = `${TOKEN_PREFIX}${raw}`;
  return { token, hash: hashToken(token) };
}

/**
 * Create a bearer token. Can be scoped to an admin user, an end user, or both.
 */
export function createSession(opts: {
  userId?: string;
  endUserId?: string;
  appId?: string;
  label?: string;
  scopes?: string;
  expiresInDays?: number;
}): { sessionId: string; token: string } {
  const {
    userId,
    endUserId,
    appId,
    label,
    scopes = "gateway",
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

export function createShortLivedSession(opts: {
  userId?: string;
  endUserId?: string;
  appId?: string;
  label?: string;
  scopes?: string;
  expiresInMinutes: number;
}): { sessionId: string; token: string } {
  const {
    userId,
    endUserId,
    appId,
    label,
    scopes = "gateway",
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

function createSessionWithExpiryMs(opts: {
  userId?: string;
  endUserId?: string;
  appId?: string;
  label?: string;
  scopes: string;
  expiresInMs: number;
}): { sessionId: string; token: string } {
  const { userId, endUserId, appId, label, scopes, expiresInMs } = opts;
  const safeExpiresInMs = Math.max(1, Math.floor(expiresInMs));

  const { token, hash } = generateBearerToken();
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + safeExpiresInMs).toISOString();

  db.insert(sessions)
    .values({
      id: sessionId,
      userId: userId || null,
      endUserId: endUserId || null,
      appId: appId || null,
      label: label || null,
      tokenHash: hash,
      scopes,
      expiresAt,
    })
    .run();

  return { sessionId, token };
}

export function revokeSession(sessionId: string): boolean {
  const result = db.delete(sessions).where(eq(sessions.id, sessionId)).run();
  return result.changes > 0;
}

export interface AuthResult {
  userId: string | null;
  endUserId: string | null;
  appId: string | null;
  sessionId: string;
  scopes: string;
  tokenHash: string;
}

/**
 * Validate a bearer token. Returns auth info including which end user
 * (if any) the token is scoped to.
 */
export function validateBearerToken(token: string): AuthResult | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const hash = hashToken(token);
  const now = new Date().toISOString();

  const session = db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hash), gt(sessions.expiresAt, now)))
    .get();

  if (!session) return null;

  return {
    userId: session.userId,
    endUserId: session.endUserId,
    appId: session.appId || null,
    sessionId: session.id,
    scopes: session.scopes,
    tokenHash: hash,
  };
}

export function hasScope(scopes: string, required: string): boolean {
  if (scopes === "admin") return true;
  return scopes
    .split(",")
    .map((s) => s.trim())
    .includes(required);
}

export function authenticateRequest(request: NextRequest): AuthResult | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  // Try pmth_ session token first
  const sessionResult = validateBearerToken(token);
  if (sessionResult) return sessionResult;

  // Fall back to OIDC JWT verification (async, but we return a promise-compatible shim)
  // Note: callers that need OIDC support should use authenticateRequestAsync()
  return null;
}

/**
 * Authenticate a request, supporting both pmth_ session tokens and OIDC JWTs.
 * Use this in API routes that should accept OIDC access tokens from SDK clients.
 */
export async function authenticateRequestAsync(request: NextRequest): Promise<AuthResult | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  // Try pmth_ session token first (fast, synchronous)
  const sessionResult = validateBearerToken(token);
  if (sessionResult) return sessionResult;

  // Fall back to OIDC JWT verification
  const jwtPayload = await verifyAccessToken(token);
  if (!jwtPayload) {
    if (DEBUG_OIDC_LOGS) {
      console.warn("[OIDC] bearer token rejected by JWT verifier");
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
  const hasGatewayBoolean = (jwtPayload as Record<string, unknown>).gateway === true;
  const effectiveScopes = normalizedScopes || (hasGatewayBoolean ? "gateway" : "");

  return {
    userId: typeof jwtPayload.sub === "string" ? jwtPayload.sub : null,
    endUserId: null,
    appId: typeof jwtPayload.client_id === "string" ? jwtPayload.client_id : null,
    sessionId: typeof jwtPayload.jti === "string" ? jwtPayload.jti : `jwt_${Date.now()}`,
    scopes: effectiveScopes,
    tokenHash: "",
  };
}

export function requireAuth(
  request: NextRequest,
  requiredScope: string
): AuthResult {
  const auth = authenticateRequest(request);
  if (!auth) {
    throw new AuthError("Unauthorized: invalid or expired token", 401);
  }
  if (!hasScope(auth.scopes, requiredScope)) {
    throw new AuthError(
      `Forbidden: requires '${requiredScope}' scope`,
      403
    );
  }
  return auth;
}

export class AuthError extends Error {
  status: number;
  constructor(
    message: string,
    status: number
  ) {
    super(message);
    this.status = status;
  }
}

import { db } from "@/db/index";
import { sessions, users } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";
import type { NextRequest } from "next/server";

const TOKEN_PREFIX = "pmth_";

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
  label?: string;
  scopes?: string;
  expiresInDays?: number;
}): { sessionId: string; token: string } {
  const {
    userId,
    endUserId,
    label,
    scopes = "gateway",
    expiresInDays = 90,
  } = opts;

  const { token, hash } = generateBearerToken();
  const sessionId = uuidv4();
  const expiresAt = new Date(
    Date.now() + expiresInDays * 24 * 60 * 60 * 1000
  ).toISOString();

  db.insert(sessions)
    .values({
      id: sessionId,
      userId: userId || null,
      endUserId: endUserId || null,
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
  return validateBearerToken(authHeader.slice(7));
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

import { randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { SignJWT } from "jose";
import { ensureSigningKey } from "@/lib/oidc/jwks";
import { getIssuer } from "@/lib/oidc/tokens";
import { createSession, revokeSession, validateBearerToken } from "@/lib/auth";
import { db } from "@/db/index";
import { appUsers } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_DAYS = 30;

export async function issueProgrammaticTokens(input: {
  appId: string;
  clientId: string;
  appUserId: string;
  scopes: string[];
  role?: string;
}) {
  const issuer = getIssuer();
  const keyPair = await ensureSigningKey();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const scope = input.scopes.join(" ").trim();

  const accessToken = await new SignJWT({
    scope,
    scp: input.scopes,
    app_id: input.clientId,
    client_id: input.clientId,
    roles: [input.role || "user"],
    user_type: "app_user",
  })
    .setProtectedHeader({ alg: "RS256", kid: keyPair.kid, typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(issuer)
    .setSubject(input.appUserId)
    .setJti(uuidv4())
    .setIssuedAt(nowSeconds)
    .setNotBefore(nowSeconds)
    .setExpirationTime(nowSeconds + ACCESS_TOKEN_TTL_SECONDS)
    .sign(keyPair.privateKey);

  const refresh = await createSession({
    appId: input.clientId,
    label: `app_user_refresh:${input.appUserId}`,
    scopes: scope,
    expiresInDays: REFRESH_TOKEN_TTL_DAYS,
  });

  return {
    access_token: accessToken,
    refresh_token: refresh.token,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope,
    subject_type: "app_user",
  };
}

export async function rotateProgrammaticRefreshToken(refreshToken: string) {
  const session = await validateBearerToken(refreshToken);
  if (!session?.label?.startsWith("app_user_refresh:") || !session.appId) {
    return null;
  }

  const appUserId = session.label.replace("app_user_refresh:", "");
  const appUserRows = await db
    .select()
    .from(appUsers)
    .where(
      and(
        eq(appUsers.id, appUserId),
        eq(appUsers.clientId, session.appId),
      ),
    )
    .limit(1);
  const appUser = appUserRows[0];

  if (!appUser || appUser.status !== "active") {
    return null;
  }

  await revokeSession(session.sessionId);

  return issueProgrammaticTokens({
    appId: session.appId,
    clientId: session.appId,
    appUserId: appUser.id,
    scopes: session.scopes.split(",").map((scope) => scope.trim()).filter(Boolean),
    role: appUser.role,
  });
}

export function generateApiKeyValue() {
  return `pmth_${randomBytes(32).toString("hex")}`;
}

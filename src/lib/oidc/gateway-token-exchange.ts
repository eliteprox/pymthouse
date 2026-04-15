import { validateClientSecret } from "./clients";
import { verifyAccessToken } from "./tokens";
import { createSession, hasScope } from "@/lib/auth";
import { TokenExchangeError } from "./token-exchange";

/** RFC 8693: access token as subject token */
export const SUBJECT_ACCESS_TOKEN_TYPE =
  "urn:ietf:params:oauth:token-type:access_token";

/** RFC 8693: issued token is an access token (opaque remote signer session) */
export const ISSUED_ACCESS_TOKEN_TYPE =
  "urn:ietf:params:oauth:token-type:access_token";

/**
 * Remote signer session exchange: OIDC access token (JWT from this issuer) -> long-lived `pmth_*`
 * session, via RFC 8693 at POST /api/v1/oidc/token.
 *
 * Any confidential client may call this grant if `subject_token` was issued to that same
 * `client_id` (JWT `client_id` / `azp` must match the authenticated client).
 */
export async function handleGatewayTokenExchange(params: {
  clientId: string;
  clientSecret: string;
  subjectToken: string;
  subjectTokenType: string;
}): Promise<{
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  issued_token_type: string;
  scope: string;
}> {
  const { clientId, clientSecret, subjectToken, subjectTokenType } = params;

  if (subjectTokenType !== SUBJECT_ACCESS_TOKEN_TYPE) {
    throw new TokenExchangeError(
      "unsupported_token_type",
      `For remote signer session exchange, subject_token_type must be ${SUBJECT_ACCESS_TOKEN_TYPE}`,
    );
  }

  if (!(await validateClientSecret(clientId, clientSecret))) {
    throw new TokenExchangeError("invalid_client", "Invalid client credentials");
  }

  const payload = await verifyAccessToken(subjectToken);
  if (!payload || typeof payload.sub !== "string" || !payload.sub) {
    throw new TokenExchangeError(
      "invalid_grant",
      "subject_token is not a valid OIDC access token for this issuer",
    );
  }

  const rec = payload as Record<string, unknown>;
  const tokenClientId =
    typeof rec.client_id === "string"
      ? rec.client_id
      : typeof rec.azp === "string"
        ? rec.azp
        : null;
  if (!tokenClientId || tokenClientId !== clientId) {
    throw new TokenExchangeError(
      "invalid_grant",
      "subject_token must have been issued to the same client_id as this request",
    );
  }

  const scopeFromScope =
    typeof payload.scope === "string" ? payload.scope : "";
  const scpRaw = (payload as Record<string, unknown>).scp;
  const scopeFromScp = Array.isArray(scpRaw)
    ? scpRaw.filter((v): v is string => typeof v === "string").join(" ")
    : typeof scpRaw === "string"
      ? scpRaw
      : "";
  const normalizedScopes = (scopeFromScope || scopeFromScp)
    .trim()
    .replace(/\s+/g, ",");
  const effectiveScopes = normalizedScopes;

  if (!hasScope(effectiveScopes, "sign:job")) {
    throw new TokenExchangeError(
      "invalid_grant",
      "subject_token must include sign:job scope for remote signer session exchange",
    );
  }

  const { token } = await createSession({
    userId: payload.sub,
    scopes: "sign:job",
    label: "remote_signer_session_exchange",
    expiresInDays: 90,
  });

  const expiresIn = 90 * 24 * 60 * 60;

  return {
    access_token: token,
    token_type: "Bearer",
    expires_in: expiresIn,
    issued_token_type: ISSUED_ACCESS_TOKEN_TYPE,
    scope: "sign:job",
  };
}

export function isGatewayTokenExchangeRequest(params: {
  grantType: string;
  clientId: string;
  subjectTokenType: string;
}): boolean {
  return (
    params.grantType ===
      "urn:ietf:params:oauth:grant-type:token-exchange" &&
    Boolean(params.clientId) &&
    params.subjectTokenType === SUBJECT_ACCESS_TOKEN_TYPE
  );
}

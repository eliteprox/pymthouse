import { createHmac } from "crypto";

export const CONSENT_COOKIE_NAME = "oidc_consent_pending";
const CONSENT_COOKIE_MAX_AGE = 600; // 10 minutes (matches auth code expiry)

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required for OIDC consent tokens");
  }
  return secret;
}

export interface ConsentPayload {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  nonce: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
}

function payloadString(p: ConsentPayload): string {
  return `${p.clientId}|${p.redirectUri}|${p.scope}|${p.state}|${p.nonce ?? ""}|${p.codeChallenge ?? ""}|${p.codeChallengeMethod ?? ""}`;
}

export function createConsentToken(payload: ConsentPayload): string {
  const secret = getSecret();
  const data = payloadString(payload);
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  const encoded = Buffer.from(data, "utf8").toString("base64url");
  return `${encoded}.${sig}`;
}

export function verifyConsentToken(
  token: string,
  payload: ConsentPayload
): boolean {
  try {
    const [encoded, sig] = token.split(".");
    if (!encoded || !sig) return false;
    const data = Buffer.from(encoded, "base64url").toString("utf8");
    const expected = payloadString(payload);
    if (data !== expected) return false;
    const secret = getSecret();
    const expectedSig = createHmac("sha256", secret).update(data).digest("base64url");
    return sig === expectedSig;
  } catch {
    return false;
  }
}

export function getConsentCookieOptions(): { name: string; options: Record<string, unknown> } {
  return {
    name: CONSENT_COOKIE_NAME,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: CONSENT_COOKIE_MAX_AGE,
      path: "/",
    },
  };
}

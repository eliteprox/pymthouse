import { getIssuer, getPublicOrigin } from "@/lib/oidc/tokens";

/** Cookie set when we send the user to the RP's `initiate_login_uri` once, to avoid a redirect loop when they return. */
export const THIRD_PARTY_INITIATE_SKIP_COOKIE = "pmth_tp_init_skip";

const INITIATE_SKIP_MAX_AGE_SEC = 600;

/**
 * OIDC Core — "Initiating Login from a Third Party" (initiate_login_uri).
 * Query parameters: iss (REQUIRED), login_hint (OPTIONAL), target_link_uri (REQUIRED for our use).
 */
export function normalizeIssuerUrl(iss: string): string {
  try {
    const u = new URL(iss);
    return u.href.replace(/\/+$/, "");
  } catch {
    return iss.trim();
  }
}

export function issuerMatchesExpected(iss: string | null, expectedIssuer: string): boolean {
  if (!iss || !iss.trim()) return false;
  try {
    return normalizeIssuerUrl(iss) === normalizeIssuerUrl(expectedIssuer);
  } catch {
    return false;
  }
}

export function buildDeviceFlowTargetLinkUri(searchParams: {
  user_code?: string | null;
  client_id?: string | null;
  iss?: string | null;
  login_hint?: string | null;
}): string {
  const base = new URL("/oidc/device", getPublicOrigin());
  if (searchParams.user_code) {
    base.searchParams.set("user_code", searchParams.user_code);
  }
  if (searchParams.client_id) {
    base.searchParams.set("client_id", searchParams.client_id);
  }
  if (searchParams.iss) {
    base.searchParams.set("iss", searchParams.iss);
  }
  if (searchParams.login_hint) {
    base.searchParams.set("login_hint", searchParams.login_hint);
  }
  return base.href;
}

export function buildInitiateLoginRedirectUrl(
  initiateLoginUri: string,
  args: {
    iss: string;
    target_link_uri: string;
    login_hint?: string | null;
  },
): string {
  const dest = new URL(initiateLoginUri);
  dest.searchParams.set("iss", args.iss);
  dest.searchParams.set("target_link_uri", args.target_link_uri);
  if (args.login_hint && args.login_hint.trim()) {
    dest.searchParams.set("login_hint", args.login_hint.trim());
  }
  return dest.toString();
}

export function initiateSkipCookieOptions(): {
  httpOnly: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
  secure: boolean;
} {
  const secure =
    process.env.NODE_ENV === "production" ||
    (process.env.NEXTAUTH_URL ?? "").startsWith("https:");
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: INITIATE_SKIP_MAX_AGE_SEC,
    secure,
  };
}

export { getIssuer };

/**
 * Issuer / origin URL helpers only — safe to import from Client Components.
 * Do not import DB-backed JWKS or token verification from here.
 */

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

export function getCanonicalIssuer(): string {
  return getIssuer();
}

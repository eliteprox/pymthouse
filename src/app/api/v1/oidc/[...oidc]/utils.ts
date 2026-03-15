import { normalizeProviderPath, PROVIDER_ENDPOINT_PATHS } from "@/lib/oidc/routes";
import { OIDC_MOUNT_PATH, getPublicOrigin } from "@/lib/oidc/tokens";

export function deriveExternalOriginFromHeaders(headers: Headers): string {
  const publicFallback = getPublicOrigin();
  const xfHostRaw = headers.get("x-forwarded-host");
  if (!xfHostRaw) return publicFallback;

  const xfProtoRaw = headers.get("x-forwarded-proto");
  const host = xfHostRaw.split(",")[0]?.trim();
  const protoCandidate = xfProtoRaw?.split(",")[0]?.trim().toLowerCase();
  const proto =
    protoCandidate === "http" || protoCandidate === "https"
      ? protoCandidate
      : new URL(publicFallback).protocol.replace(":", "");

  if (!host) return publicFallback;
  return `${proto}://${host}`;
}

export function resolveRedirectLocation(location: string, origin: string): URL {
  if (/^https?:\/\//i.test(location)) {
    return new URL(location);
  }

  // When provider emits relative paths, ensure they remain under our mount.
  if (
    location.startsWith("/") &&
    !location.startsWith(OIDC_MOUNT_PATH) &&
    Object.values(PROVIDER_ENDPOINT_PATHS).some((path) => location.startsWith(path))
  ) {
    return new URL(`${OIDC_MOUNT_PATH}${location}`, origin);
  }

  return new URL(location, origin);
}

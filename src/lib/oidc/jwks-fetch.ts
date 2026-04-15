import * as jose from "jose";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

interface CachedJWKS {
  jwks: jose.JSONWebKeySet;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_MAX_ENTRIES = 128;
const cache = new Map<string, CachedJWKS>();

function isPrivateOrReservedIpv4(ip: string): boolean {
  const octets = ip.split(".").map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) {
    return true;
  }

  const [a, b, c] = octets;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") {
    return true;
  }

  if (/^fe[89ab]/.test(normalized)) {
    return true;
  }

  if (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8")
  ) {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isIP(mapped) === 4 ? isPrivateOrReservedIpv4(mapped) : true;
  }

  return false;
}

function isPrivateOrReservedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateOrReservedIpv4(ip);
  if (family === 6) return isPrivateOrReservedIpv6(ip);
  return true;
}

async function assertSafeJwksUri(jwksUri: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(jwksUri);
  } catch {
    throw new Error("JWKS URI is not a valid URL");
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "https:" && protocol !== "http:") {
    throw new Error("JWKS URI must use http or https");
  }

  if (process.env.NODE_ENV === "production" && protocol !== "https:") {
    throw new Error("JWKS URI must use https in production");
  }

  if (parsed.username || parsed.password) {
    throw new Error("JWKS URI must not include credentials");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("JWKS URI points to a disallowed host");
  }

  if (isIP(hostname) && isPrivateOrReservedIp(hostname)) {
    throw new Error("JWKS URI resolves to a disallowed IP range");
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new Error("JWKS URI host has no DNS records");
  }

  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new Error("JWKS URI resolves to a disallowed IP range");
    }
  }
}

export async function fetchPlatformJWKS(jwksUri: string): Promise<jose.JSONWebKeySet> {
  await assertSafeJwksUri(jwksUri);

  const cached = cache.get(jwksUri);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.jwks;
  }

  const res = await fetch(jwksUri, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
    // Do not follow redirects: DNS was validated for the original host only.
    redirect: "error",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS from ${jwksUri}: ${res.status}`);
  }

  const body = await res.json() as jose.JSONWebKeySet;

  if (!body.keys || !Array.isArray(body.keys) || body.keys.length === 0) {
    throw new Error(`Invalid JWKS from ${jwksUri}: no keys found`);
  }

  if (!cache.has(jwksUri) && cache.size >= CACHE_MAX_ENTRIES) {
    const oldestEntry = [...cache.entries()].sort(
      (a, b) => a[1].fetchedAt - b[1].fetchedAt,
    )[0];
    if (oldestEntry) {
      cache.delete(oldestEntry[0]);
    }
  }

  cache.set(jwksUri, { jwks: body, fetchedAt: Date.now() });
  return body;
}

export function invalidateJWKSCache(jwksUri: string): void {
  cache.delete(jwksUri);
}

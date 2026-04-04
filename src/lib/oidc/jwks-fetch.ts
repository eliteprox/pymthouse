import * as jose from "jose";

interface CachedJWKS {
  jwks: jose.JSONWebKeySet;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, CachedJWKS>();

export async function fetchPlatformJWKS(jwksUri: string): Promise<jose.JSONWebKeySet> {
  const cached = cache.get(jwksUri);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.jwks;
  }

  const res = await fetch(jwksUri, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS from ${jwksUri}: ${res.status}`);
  }

  const body = await res.json() as jose.JSONWebKeySet;

  if (!body.keys || !Array.isArray(body.keys) || body.keys.length === 0) {
    throw new Error(`Invalid JWKS from ${jwksUri}: no keys found`);
  }

  cache.set(jwksUri, { jwks: body, fetchedAt: Date.now() });
  return body;
}

export function invalidateJWKSCache(jwksUri: string): void {
  cache.delete(jwksUri);
}

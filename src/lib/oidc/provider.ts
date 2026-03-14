/**
 * node-oidc-provider configuration.
 *
 * Replaces the 7 custom OIDC route files with a single certified provider.
 */

import { Provider, interactionPolicy } from "oidc-provider";
import type { Configuration, ClientMetadata, KoaContextWithOIDC } from "oidc-provider";
import { SqliteAdapter } from "./adapter";
import { findAccount } from "./account";
import { getIssuer } from "./tokens";
import { hashClientSecret } from "./clients";
import { db } from "@/db/index";
import { oidcSigningKeys, oidcClients } from "@/db/schema";
import { desc } from "drizzle-orm";
import { timingSafeEqual } from "crypto";
import * as jose from "jose";

const KEY_ALGORITHM = "RS256";

/**
 * Load JWKS from the existing `oidc_signing_keys` table.
 * Falls back to an empty set (provider will warn).
 */
async function loadJWKS(): Promise<{ keys: jose.JWK[] }> {
  const keys = db
    .select()
    .from(oidcSigningKeys)
    .orderBy(desc(oidcSigningKeys.createdAt))
    .limit(5)
    .all();

  const jwks: jose.JWK[] = [];

  for (const key of keys) {
    const privateKey = await jose.importPKCS8(key.privateKeyPem, KEY_ALGORITHM, {
      extractable: true,
    });
    const jwk = await jose.exportJWK(privateKey);
    jwks.push({
      ...jwk,
      kid: key.kid,
      alg: KEY_ALGORITHM,
      use: "sig",
    });
  }

  return { keys: jwks };
}

/**
 * Load clients from the `oidc_clients` table and convert to the
 * node-oidc-provider ClientMetadata format.
 */
function loadClients(): ClientMetadata[] {
  const rows = db.select().from(oidcClients).all();

  return rows.map((row) => {
    const redirectUris = (JSON.parse(row.redirectUris) as string[])
      // Expand wildcard patterns into common localhost ports.
      // node-oidc-provider requires exact redirect URI matching per spec.
      .flatMap((uri) => {
        if (!uri.includes("*")) return [uri];
        // Expand localhost:* to common dev ports
        const expanded: string[] = [];
        const commonPorts = [
          "3000", "3001", "3002", "3003", "3004", "3005",
          "4000", "4001", "4200", "5000", "5173", "5174",
          "8000", "8080", "8081", "8888", "9000",
        ];
        for (const port of commonPorts) {
          expanded.push(uri.replace(/:\*/, `:${port}`).replace(/\*/g, ""));
        }
        return expanded;
      });

    const grantTypes = row.grantTypes.split(",").filter(Boolean);

    const meta: ClientMetadata = {
      client_id: row.clientId,
      client_name: row.displayName,
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      response_types: ["code"],
      token_endpoint_auth_method: row.tokenEndpointAuthMethod as "none" | "client_secret_post" | "client_secret_basic",
      scope: row.allowedScopes,
    };

    if (row.clientSecretHash) {
      // Store the SHA-256 hash in client_secret and patch comparison logic
      // to hash incoming secrets before constant-time comparison.
      meta.client_secret = row.clientSecretHash;
      meta.client_secret_expires_at = 0;
    } else if (meta.token_endpoint_auth_method !== "none") {
      // Safety guard: clients without a secret cannot be confidential.
      meta.token_endpoint_auth_method = "none";
    }

    return meta;
  });
}

function patchHashedClientSecretComparison(provider: Provider): void {
  const clientPrototype = (
    provider.Client as unknown as {
      prototype?: {
        compareClientSecret?: (actual: string) => Promise<boolean> | boolean;
        __pmthHashedSecretPatchApplied?: boolean;
      };
    }
  ).prototype;

  if (!clientPrototype?.compareClientSecret) {
    return;
  }

  if (clientPrototype.__pmthHashedSecretPatchApplied) {
    return;
  }

  const originalCompare = clientPrototype.compareClientSecret;
  clientPrototype.compareClientSecret = async function patchedCompare(actual: string) {
    const storedSecret = (this as { clientSecret?: string }).clientSecret;
    if (typeof storedSecret === "string" && /^[a-f0-9]{64}$/i.test(storedSecret)) {
      const actualHash = hashClientSecret(actual ?? "");
      const stored = Buffer.from(storedSecret);
      const provided = Buffer.from(actualHash);
      if (stored.length !== provided.length) {
        return false;
      }
      return timingSafeEqual(stored, provided);
    }
    return originalCompare.call(this, actual);
  };

  clientPrototype.__pmthHashedSecretPatchApplied = true;
}

/**
 * Build the interaction policy that auto-approves trusted clients
 * like `naap` (matching the current `prompt=none` / `skipConsent` behavior).
 */
function buildInteractionPolicy() {
  const basePolicy = interactionPolicy.base();

  // Modify the consent prompt: skip it for the naap client
  const consent = basePolicy.find((p) => p.name === "consent");
  if (consent) {
    const { Check } = interactionPolicy;
    // Remove all existing consent checks and add one that auto-skips for naap
    consent.checks.clear();
    consent.checks.add(
      new Check(
        "native_client_prompt",
        "consent required for third-party clients",
        async (ctx) => {
          const oidc = ctx.oidc;
          // Skip consent for naap (trusted first-party)
          if (oidc.client?.clientId === "naap") {
            return Check.NO_NEED_TO_PROMPT;
          }

          const requestedScopes = Array.from(oidc.requestParamScopes ?? []);
          const grantId = oidc.session?.grantIdFor(oidc.client!.clientId);
          if (!grantId) {
            return Check.REQUEST_PROMPT;
          }

          const grant = await ctx.oidc.provider.Grant.find(grantId);
          if (!grant) {
            return Check.REQUEST_PROMPT;
          }

          const grantedScopeSet = new Set(
            (grant
              .getOIDCScope()
              .split(/\s+/)
              .map((scope) => scope.trim())
              .filter(Boolean)),
          );

          const allRequestedScopesCovered = requestedScopes.every((scope) =>
            grantedScopeSet.has(scope),
          );

          return allRequestedScopesCovered
            ? Check.NO_NEED_TO_PROMPT
            : Check.REQUEST_PROMPT;
        },
        (ctx) => ({ scopes: ctx.oidc.requestParamScopes }),
      ),
    );
  }

  return basePolicy;
}

let _provider: Provider | null = null;

export async function getProvider(): Promise<Provider> {
  if (_provider) return _provider;

  const issuer = getIssuer();
  const jwks = await loadJWKS();
  const clients = loadClients();

  const configuration: Configuration = {
    adapter: SqliteAdapter,

    clients,

    findAccount,

    jwks: jwks as Configuration["jwks"],

    // Allow CORS from redirect URI origins, plus the issuer origin (admin UI testing device flow).
    clientBasedCORS: (ctx, origin, client) => {
      const issuerOrigin = new URL(issuer).origin;
      if (origin === issuerOrigin) {
        return true; // Same-origin (e.g. admin UI at localhost:3001 testing device flow)
      }
      const uris = client.redirectUris ?? [];
      return uris.some((uri) => {
        try {
          return new URL(uri).origin === origin;
        } catch {
          return false;
        }
      });
    },

    // Custom scopes
    scopes: [
      "openid",
      "profile",
      "email",
      "role",
      "plan",
      "entitlements",
      "gateway",
      "offline_access",
    ],

    // Map scopes to claims
    claims: {
      openid: ["sub"],
      profile: ["name"],
      email: ["email"],
      role: ["role"],
      plan: ["plan"],
      entitlements: ["entitlements"],
      gateway: ["gateway"],
    },

    // Only support code flow
    responseTypes: ["code"],

    // Support these auth methods
    clientAuthMethods: ["none", "client_secret_post", "client_secret_basic"],

    // PKCE required for public clients
    pkce: {
      required: (_ctx, client) => client.tokenEndpointAuthMethod === "none",
    },

    // Rotate refresh tokens on use
    rotateRefreshToken: true,

    // Always issue refresh tokens when refresh_token grant is allowed
    issueRefreshToken: async (_ctx, client, code) => {
      if (!client.grantTypeAllowed("refresh_token")) return false;
      return code.scopes.has("offline_access") || code.scopes.has("openid");
    },

    features: {
      devInteractions: { enabled: false },
      deviceFlow: {
        enabled: true,
        charset: "base-20",
        mask: "****-****",
      },
      userinfo: { enabled: true },
      revocation: { enabled: true },
      introspection: { enabled: true },
      resourceIndicators: {
        enabled: true,
        defaultResource: async (_ctx) => {
          return getIssuer();
        },
        getResourceServerInfo: async (_ctx, resourceIndicator, _client) => {
          return {
            scope: "openid profile email role plan entitlements gateway offline_access",
            audience: resourceIndicator,
            accessTokenFormat: "jwt" as const,
            accessTokenTTL: 3600,
            jwt: {
              sign: { alg: "RS256" as const },
            },
          };
        },
        useGrantedResource: async () => true,
      },
    },

    // TTLs matching the current implementation
    ttl: {
      AccessToken: 3600,          // 1 hour
      AuthorizationCode: 600,     // 10 minutes
      DeviceCode: 600,            // 10 minutes
      IdToken: 3600,              // 1 hour
      RefreshToken: 30 * 24 * 3600, // 30 days
      Interaction: 600,           // 10 minutes
      Session: 14 * 24 * 3600,   // 14 days
      Grant: 14 * 24 * 3600,     // 14 days
    },

    // Interaction URL — redirect to our custom consent/login pages
    interactions: {
      policy: buildInteractionPolicy(),
      url: async (ctx: KoaContextWithOIDC, interaction) => {
        // Always route through a single interaction page so login and consent
        // share one cookie-bound interaction lifecycle.
        return `/oidc/interaction?uid=${interaction.uid}`;
      },
    },

    // Cookie signing keys and path
    cookies: {
      keys: [process.env.NEXTAUTH_SECRET || "dev-secret-change-me"],
      // Use path=/ so _interaction cookie is sent for /oidc/interaction, /api/v1/oidc/interaction,
      // and consent POSTs. The default (path=destination) would restrict the cookie to the
      // interaction URL only, breaking client-side POSTs to the API route.
      short: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
      },
    },

    // Conformant id_token claims (only include sub by default, rest via userinfo)
    // Set to false to include claims in id_token directly (matching current behavior)
    conformIdTokenClaims: false,

    // RS256 only
    enabledJWA: {
      idTokenSigningAlgValues: ["RS256"],
    },

    // Add custom claims to access tokens
    extraTokenClaims: async (_ctx, token) => {
      if (token.kind === "AccessToken") {
        return { client_id: token.clientId };
      }
      return undefined;
    },

    // Load existing grants for returning users
    loadExistingGrant: async (ctx) => {
      const grantId =
        ctx.oidc.result?.consent?.grantId ||
        ctx.oidc.session!.grantIdFor(ctx.oidc.client!.clientId);

      if (grantId) {
        const grant = await ctx.oidc.provider.Grant.find(grantId);
        if (grant) return grant;
      }

      // Auto-grant for naap (trusted first-party)
      if (ctx.oidc.client?.clientId === "naap") {
        const grant = new ctx.oidc.provider.Grant();
        grant.clientId = ctx.oidc.client.clientId;
        grant.accountId = ctx.oidc.session!.accountId!;

        const requestedScopes = ctx.oidc.requestParamScopes;
        if (requestedScopes) {
          const scopeStr = Array.from(requestedScopes).join(" ");
          grant.addOIDCScope(scopeStr);
          grant.addResourceScope(issuer, scopeStr);
        }

        await grant.save();
        return grant;
      }

      return undefined;
    },
  };

  _provider = new Provider(issuer, configuration);
  patchHashedClientSecretComparison(_provider);

  // Trust the proxy (Next.js + reverse proxy)
  _provider.proxy = true;

  // Run periodic cleanup of expired adapter rows
  setInterval(() => SqliteAdapter.cleanup(), 10 * 60 * 1000);

  return _provider;
}

import { db } from "@/db/index";
import { oidcClients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { createHash, randomBytes } from "crypto";
import { DEFAULT_OIDC_SCOPES } from "@/lib/oidc/scopes";

export interface OidcClientConfig {
  clientId: string;
  clientSecret?: string;
  displayName: string;
  redirectUris: string[];
  allowedScopes?: string;
  grantTypes?: string[];
  tokenEndpointAuthMethod?: "none" | "client_secret_post" | "client_secret_basic";
}

export function hashClientSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function registerClient(config: OidcClientConfig): void {
  const existing = db
    .select()
    .from(oidcClients)
    .where(eq(oidcClients.clientId, config.clientId))
    .get();

  if (existing) {
    db.update(oidcClients)
      .set({
        displayName: config.displayName,
        redirectUris: JSON.stringify(config.redirectUris),
        allowedScopes: config.allowedScopes || DEFAULT_OIDC_SCOPES,
        grantTypes: (config.grantTypes || ["authorization_code", "refresh_token"]).join(","),
        tokenEndpointAuthMethod: config.tokenEndpointAuthMethod || "none",
        clientSecretHash: config.clientSecret
          ? hashClientSecret(config.clientSecret)
          : null,
      })
      .where(eq(oidcClients.clientId, config.clientId))
      .run();
    return;
  }

  db.insert(oidcClients)
    .values({
      id: uuidv4(),
      clientId: config.clientId,
      clientSecretHash: config.clientSecret
        ? hashClientSecret(config.clientSecret)
        : null,
      displayName: config.displayName,
      redirectUris: JSON.stringify(config.redirectUris),
      allowedScopes: config.allowedScopes || DEFAULT_OIDC_SCOPES,
      grantTypes: (config.grantTypes || ["authorization_code", "refresh_token"]).join(","),
      tokenEndpointAuthMethod: config.tokenEndpointAuthMethod || "none",
    })
    .run();
}

/**
 * Return the set of allowed redirect URI origins for all registered clients.
 * Used for defense-in-depth origin validation when forwarding provider redirects.
 * Wildcard URIs (e.g. http://localhost:*) are expanded to common dev ports.
 */
export function getRegisteredRedirectOrigins(): Set<string> {
  const rows = db.select().from(oidcClients).all();
  const origins = new Set<string>();
  const commonPorts = [
    "3000", "3001", "3002", "3003", "3004", "3005",
    "4000", "4001", "4200", "5000", "5173", "5174",
    "8000", "8080", "8081", "8888", "9000",
  ];

  for (const row of rows) {
    const uris = JSON.parse(row.redirectUris) as string[];
    for (const uri of uris) {
      if (uri.includes("*")) {
        // Expand wildcard patterns to the same set used when loading into the provider.
        for (const port of commonPorts) {
          try {
            origins.add(new URL(uri.replace(/:\*/, `:${port}`).replace(/\*/g, "")).origin);
          } catch {
            /* malformed URI, skip */
          }
        }
      } else {
        try {
          origins.add(new URL(uri).origin);
        } catch {
          /* malformed URI, skip */
        }
      }
    }
  }

  return origins;
}

export function getClient(clientId: string): {
  id: string;
  clientId: string;
  displayName: string;
  redirectUris: string[];
  allowedScopes: string[];
  grantTypes: string[];
  tokenEndpointAuthMethod: string;
  clientSecretHash: string | null;
} | null {
  const client = db
    .select()
    .from(oidcClients)
    .where(eq(oidcClients.clientId, clientId))
    .get();

  if (!client) return null;

  return {
    id: client.id,
    clientId: client.clientId,
    displayName: client.displayName,
    redirectUris: JSON.parse(client.redirectUris) as string[],
    allowedScopes: client.allowedScopes.split(/[,\s]+/).filter(Boolean),
    grantTypes: client.grantTypes.split(",").filter(Boolean),
    tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
    clientSecretHash: client.clientSecretHash,
  };
}

export function validateRedirectUri(clientId: string, redirectUri: string): boolean {
  const client = getClient(clientId);
  if (!client) return false;

  return client.redirectUris.some((pattern) => {
    if (pattern.includes("*")) {
      const regex = new RegExp(
        "^" + pattern.replace(/\*/g, ".*").replace(/\//g, "\\/") + "$"
      );
      return regex.test(redirectUri);
    }
    return pattern === redirectUri;
  });
}

export function validateClientSecret(
  clientId: string,
  clientSecret: string
): boolean {
  const client = getClient(clientId);
  if (!client || !client.clientSecretHash) return false;

  const providedHash = hashClientSecret(clientSecret);
  return providedHash === client.clientSecretHash;
}

export function validateScopes(clientId: string, requestedScopes: string[]): string[] {
  const client = getClient(clientId);
  if (!client) return [];

  return requestedScopes.filter((scope) => client.allowedScopes.includes(scope));
}

export function generateClientId(): string {
  return `app_${randomBytes(12).toString("hex")}`;
}

export function generateClientSecret(): string {
  return `pmth_cs_${randomBytes(32).toString("hex")}`;
}

/**
 * Create an OIDC client for a developer app. Returns the DB row ID and
 * the generated client_id (no secret yet -- that comes from rotateClientSecret).
 */
export function createAppClient(displayName: string): {
  id: string;
  clientId: string;
} {
  const id = uuidv4();
  const clientId = generateClientId();

  db.insert(oidcClients)
    .values({
      id,
      clientId,
      clientSecretHash: null,
      displayName,
      redirectUris: JSON.stringify([]),
      allowedScopes: DEFAULT_OIDC_SCOPES,
      grantTypes: "authorization_code,refresh_token",
      tokenEndpointAuthMethod: "none",
    })
    .run();

  return { id, clientId };
}

/**
 * Generate a new client secret (or rotate an existing one).
 * Returns the plaintext secret -- it is NOT stored and must be shown to the user once.
 */
export function rotateClientSecret(clientId: string): string | null {
  const client = db
    .select()
    .from(oidcClients)
    .where(eq(oidcClients.clientId, clientId))
    .get();

  if (!client) return null;

  const secret = generateClientSecret();
  const secretHash = hashClientSecret(secret);

  db.update(oidcClients)
    .set({
      clientSecretHash: secretHash,
      tokenEndpointAuthMethod: "client_secret_post",
    })
    .where(eq(oidcClients.clientId, clientId))
    .run();

  return secret;
}

export function updateClientConfig(
  clientId: string,
  config: {
    displayName?: string;
    redirectUris?: string[];
    allowedScopes?: string;
    grantTypes?: string[];
    tokenEndpointAuthMethod?: "none" | "client_secret_post" | "client_secret_basic";
    postLogoutRedirectUris?: string[];
    initiateLoginUri?: string | null;
    logoUri?: string | null;
    policyUri?: string | null;
    tosUri?: string | null;
    clientUri?: string | null;
  }
): boolean {
  const existing = db
    .select()
    .from(oidcClients)
    .where(eq(oidcClients.clientId, clientId))
    .get();

  if (!existing) return false;

  const updates: Record<string, unknown> = {};
  if (config.displayName !== undefined) updates.displayName = config.displayName;
  if (config.redirectUris !== undefined) updates.redirectUris = JSON.stringify(config.redirectUris);
  if (config.allowedScopes !== undefined) updates.allowedScopes = config.allowedScopes;
  if (config.grantTypes !== undefined) updates.grantTypes = config.grantTypes.join(",");
  if (config.tokenEndpointAuthMethod !== undefined) updates.tokenEndpointAuthMethod = config.tokenEndpointAuthMethod;
  if (config.postLogoutRedirectUris !== undefined) updates.postLogoutRedirectUris = JSON.stringify(config.postLogoutRedirectUris);
  if (config.initiateLoginUri !== undefined) updates.initiateLoginUri = config.initiateLoginUri;
  if (config.logoUri !== undefined) updates.logoUri = config.logoUri;
  if (config.policyUri !== undefined) updates.policyUri = config.policyUri;
  if (config.tosUri !== undefined) updates.tosUri = config.tosUri;
  if (config.clientUri !== undefined) updates.clientUri = config.clientUri;

  if (Object.keys(updates).length === 0) return true;

  db.update(oidcClients)
    .set(updates)
    .where(eq(oidcClients.clientId, clientId))
    .run();

  return true;
}

export function seedNaapClient(): void {
  registerClient({
    clientId: "naap",
    displayName: "NaaP Platform",
    redirectUris: [
      "http://localhost:*/api/v1/auth/providers/*/callback",
      "https://*.naap.dev/api/v1/auth/providers/*/callback",
      "https://*.vercel.app/api/v1/auth/providers/*/callback",
    ],
    allowedScopes: "openid profile email",
    grantTypes: ["authorization_code", "refresh_token"],
    tokenEndpointAuthMethod: "none", // Public client (SPA/redirect flow)
  });
}

export function seedSdkClient(): void {
  registerClient({
    clientId: "livepeer-sdk",
    displayName: "Livepeer Gateway SDK",
    redirectUris: [
      "http://localhost:*/callback",
      "http://127.0.0.1:*/callback",
    ],
    allowedScopes: "openid profile email gateway",
    grantTypes: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
    tokenEndpointAuthMethod: "none", // Public client (native app, PKCE required)
  });
}

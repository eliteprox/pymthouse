import { db } from "@/db/index";
import { oidcClients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { createHash, randomBytes } from "crypto";

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
        allowedScopes: config.allowedScopes || "openid profile email",
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
      allowedScopes: config.allowedScopes || "openid profile email",
      grantTypes: (config.grantTypes || ["authorization_code", "refresh_token"]).join(","),
      tokenEndpointAuthMethod: config.tokenEndpointAuthMethod || "none",
    })
    .run();
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
      allowedScopes: "openid profile email",
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
    allowedScopes: "openid profile email plan entitlements",
    grantTypes: ["authorization_code", "refresh_token"],
    tokenEndpointAuthMethod: "none", // Public client (SPA/redirect flow)
  });
}

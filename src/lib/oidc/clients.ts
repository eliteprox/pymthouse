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

export async function registerClient(config: OidcClientConfig): Promise<void> {
  const existingRows = await db
    .select()
    .from(oidcClients)
    .where(eq(oidcClients.clientId, config.clientId))
    .limit(1);
  const existing = existingRows[0];

  if (existing) {
    await db
      .update(oidcClients)
      .set({
        displayName: config.displayName,
        redirectUris: JSON.stringify(config.redirectUris),
        allowedScopes: config.allowedScopes || DEFAULT_OIDC_SCOPES,
        grantTypes: (config.grantTypes || ["authorization_code", "refresh_token"]).join(
          ",",
        ),
        tokenEndpointAuthMethod: config.tokenEndpointAuthMethod || "none",
        clientSecretHash: config.clientSecret
          ? hashClientSecret(config.clientSecret)
          : null,
      })
      .where(eq(oidcClients.clientId, config.clientId));
    return;
  }

  await db.insert(oidcClients).values({
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
  });
}

/**
 * Return the set of allowed redirect URI origins for all registered clients.
 */
export async function getRegisteredRedirectOrigins(): Promise<Set<string>> {
  const rows = await db.select().from(oidcClients);
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

export async function getClient(clientId: string): Promise<{
  id: string;
  clientId: string;
  displayName: string;
  redirectUris: string[];
  allowedScopes: string[];
  grantTypes: string[];
  tokenEndpointAuthMethod: string;
  clientSecretHash: string | null;
  createdAt: string;
} | null> {
  const rows = await db
    .select()
    .from(oidcClients)
    .where(eq(oidcClients.clientId, clientId))
    .limit(1);
  const client = rows[0];

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
    createdAt: client.createdAt,
  };
}

/**
 * Get all OIDC clients in the database.
 * Used primarily for admin interfaces to view/manage all clients.
 */
export async function getAllClients(): Promise<Array<{
  id: string;
  clientId: string;
  displayName: string;
  redirectUris: string[];
  allowedScopes: string[];
  grantTypes: string[];
  tokenEndpointAuthMethod: string;
  hasSecret: boolean;
  createdAt: string;
}>> {
  const rows = await db.select().from(oidcClients);

  return rows.map((client) => ({
    id: client.id,
    clientId: client.clientId,
    displayName: client.displayName,
    redirectUris: JSON.parse(client.redirectUris) as string[],
    allowedScopes: client.allowedScopes.split(/[,\s]+/).filter(Boolean),
    grantTypes: client.grantTypes.split(",").filter(Boolean),
    tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
    hasSecret: !!client.clientSecretHash,
    createdAt: client.createdAt,
  }));
}

export async function validateRedirectUri(
  clientId: string,
  redirectUri: string,
): Promise<boolean> {
  const client = await getClient(clientId);
  if (!client) return false;

  return client.redirectUris.some((pattern) => {
    if (pattern.includes("*")) {
      const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const wildcardPattern = escapedPattern.replace(/\\\*/g, ".*");
      const regex = new RegExp("^" + wildcardPattern + "$");
      return regex.test(redirectUri);
    }
    return pattern === redirectUri;
  });
}

export async function validateClientSecret(
  clientId: string,
  clientSecret: string,
): Promise<boolean> {
  const client = await getClient(clientId);
  if (!client || !client.clientSecretHash) return false;

  const providedHash = hashClientSecret(clientSecret);
  return providedHash === client.clientSecretHash;
}

export async function validateScopes(
  clientId: string,
  requestedScopes: string[],
): Promise<string[]> {
  const client = await getClient(clientId);
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
export async function createAppClient(displayName: string): Promise<{
  id: string;
  clientId: string;
}> {
  const id = uuidv4();
  const clientId = generateClientId();

  await db.insert(oidcClients).values({
    id,
    clientId,
    clientSecretHash: null,
    displayName,
    redirectUris: JSON.stringify([]),
    allowedScopes: DEFAULT_OIDC_SCOPES,
    grantTypes: "authorization_code,refresh_token",
    tokenEndpointAuthMethod: "none",
  });

  return { id, clientId };
}

/**
 * Generate a new client secret (or rotate an existing one).
 * Returns the plaintext secret -- it is NOT stored and must be shown to the user once.
 */
export async function rotateClientSecret(clientId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(oidcClients)
    .where(eq(oidcClients.clientId, clientId))
    .limit(1);
  const client = rows[0];

  if (!client) return null;

  const secret = generateClientSecret();
  const secretHash = hashClientSecret(secret);

  await db
    .update(oidcClients)
    .set({
      clientSecretHash: secretHash,
      tokenEndpointAuthMethod: "client_secret_post",
    })
    .where(eq(oidcClients.clientId, clientId));

  return secret;
}

export async function updateClientConfig(
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
  },
): Promise<boolean> {
  const rows = await db
    .select()
    .from(oidcClients)
    .where(eq(oidcClients.clientId, clientId))
    .limit(1);
  const existing = rows[0];

  if (!existing) return false;

  const updates: Record<string, unknown> = {};
  if (config.displayName !== undefined) updates.displayName = config.displayName;
  if (config.redirectUris !== undefined) updates.redirectUris = JSON.stringify(config.redirectUris);
  if (config.allowedScopes !== undefined) updates.allowedScopes = config.allowedScopes;
  if (config.grantTypes !== undefined) updates.grantTypes = config.grantTypes.join(",");
  if (config.tokenEndpointAuthMethod !== undefined) {
    updates.tokenEndpointAuthMethod = config.tokenEndpointAuthMethod;
  }
  if (config.postLogoutRedirectUris !== undefined) {
    updates.postLogoutRedirectUris = JSON.stringify(config.postLogoutRedirectUris);
  }
  if (config.initiateLoginUri !== undefined) updates.initiateLoginUri = config.initiateLoginUri;
  if (config.logoUri !== undefined) updates.logoUri = config.logoUri;
  if (config.policyUri !== undefined) updates.policyUri = config.policyUri;
  if (config.tosUri !== undefined) updates.tosUri = config.tosUri;
  if (config.clientUri !== undefined) updates.clientUri = config.clientUri;

  if (Object.keys(updates).length === 0) return true;

  await db.update(oidcClients).set(updates).where(eq(oidcClients.clientId, clientId));

  return true;
}

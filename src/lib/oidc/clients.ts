import { db } from "@/db/index";
import { oidcClients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";

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

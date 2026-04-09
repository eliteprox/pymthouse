/**
 * Canonical scope definitions — single source of truth for labels and
 * descriptions used in both the app config wizard and the consent screen.
 */

export interface ScopeDefinition {
  value: string;
  label: string;
  /** Short description shown on the consent screen and in app settings. */
  description: string;
  required?: boolean;
}

export const DEFAULT_OIDC_SCOPES = "openid sign:job discover:orchestrators";

/** Browser / Authorization Code + PKCE flows for the NaaP platform. */
export const NAAP_WEB_OIDC_SCOPES = "openid sign:job discover:orchestrators";

/** Server-side `client_credentials` for NaaP services (no interactive login). */
export const NAAP_SERVICE_OIDC_SCOPES =
  "sign:job discover:orchestrators users:read users:write users:token";

export const OIDC_SCOPES: ScopeDefinition[] = [
  {
    value: "openid",
    label: "OpenID",
    description: "Confirm which PymtHouse account you are signed in with",
    required: true,
  },
  {
    value: "sign:job",
    label: "Sign Jobs",
    description: "Request payment signatures from the configured remote signer",
  },
  {
    value: "discover:orchestrators",
    label: "Discover Orchestrators",
    description: "Query the provider signer for allowed orchestrator candidates",
  },
  {
    value: "users:read",
    label: "Read Users",
    description: "Read provisioned provider-managed application users",
  },
  {
    value: "users:write",
    label: "Write Users",
    description: "Create, update, and deactivate provisioned application users",
  },
  {
    value: "users:token",
    label: "Issue User Tokens",
    description: "Issue app-user access tokens for provider-managed backends",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Administrative access to provider configuration surfaces",
  },
];

export const OIDC_SCOPE_MAP: Record<string, ScopeDefinition> = Object.fromEntries(
  OIDC_SCOPES.map((scope) => [scope.value, scope])
);

export function getScopeDefinition(scope: string): ScopeDefinition | undefined {
  return OIDC_SCOPE_MAP[scope];
}

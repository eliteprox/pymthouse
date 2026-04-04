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

export const DEFAULT_OIDC_SCOPES = "openid profile email";

export const OIDC_SCOPES: ScopeDefinition[] = [
  {
    value: "openid",
    label: "OpenID",
    description: "Confirm which PymtHouse account you are signed in with",
    required: true,
  },
  {
    value: "profile",
    label: "Basic Profile",
    description: "See your name",
  },
  {
    value: "email",
    label: "Email Address",
    description: "See your email address",
  },
  {
    value: "gateway",
    label: "Gateway Access",
    description: "Use Livepeer gateway signing and payment operations on your behalf",
  },
  {
    value: "offline_access",
    label: "Session Renewal",
    description: "Enables refresh tokens so sessions can continue without re-signing in",
  },
];

export const OIDC_SCOPE_MAP: Record<string, ScopeDefinition> = Object.fromEntries(
  OIDC_SCOPES.map((scope) => [scope.value, scope])
);

export function getScopeDefinition(scope: string): ScopeDefinition | undefined {
  return OIDC_SCOPE_MAP[scope];
}

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
    description: "See your name and profile photo",
  },
  {
    value: "email",
    label: "Email Address",
    description: "See your email address",
  },
  {
    value: "role",
    label: "Account Role",
    description: "See your account role in PymtHouse",
  },
  {
    value: "plan",
    label: "Subscription Plan",
    description: "See your current PymtHouse plan tier",
  },
  {
    value: "entitlements",
    label: "Feature Access",
    description: "See which PymtHouse features are enabled for your account",
  },
  {
    value: "gateway",
    label: "Gateway Access",
    description: "Use Livepeer gateway signing and payment operations on your behalf",
  },
  {
    value: "offline_access",
    label: "Offline Access",
    description: "Allow the app to refresh access without asking you to sign in again",
  },
];

export const OIDC_SCOPE_MAP: Record<string, ScopeDefinition> = Object.fromEntries(
  OIDC_SCOPES.map((scope) => [scope.value, scope])
);

export function getScopeDefinition(scope: string): ScopeDefinition | undefined {
  return OIDC_SCOPE_MAP[scope];
}

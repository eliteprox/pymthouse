/**
 * OIDC `client_id` values PymtHouse treats as first-party integrations:
 * consent is skipped and grants are auto-created where applicable.
 *
 * Includes legacy `naap` so existing deployments keep working after new
 * `naap-web` / `naap-service` registrations were introduced.
 */
export const TRUSTED_FIRST_PARTY_CLIENT_IDS = new Set([
  "naap",
  "naap-web",
  "naap-service",
]);

export function isTrustedFirstPartyClientId(
  clientId: string | undefined,
): boolean {
  return clientId !== undefined && TRUSTED_FIRST_PARTY_CLIENT_IDS.has(clientId);
}

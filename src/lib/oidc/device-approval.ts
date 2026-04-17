/**
 * Shared device-code approval logic for interactive UI and Builder API.
 */

import { SqliteAdapter } from "@/lib/oidc/adapter";
import { getProvider } from "@/lib/oidc/provider";
import { getIssuer } from "@/lib/oidc/tokens";

export type DeviceApprovalFailure = {
  ok: false;
  error: string;
  description: string;
  status: number;
};

export type DeviceApprovalSuccess = { ok: true };

/**
 * Bind a pending device code to an OIDC account and grant scopes.
 * `oidcClientId` must match the client that requested the device code.
 */
export async function approveDeviceCodeForAccount(
  normalizedUserCode: string,
  oidcClientId: string,
  accountId: string,
): Promise<DeviceApprovalSuccess | DeviceApprovalFailure> {
  const adapter = new SqliteAdapter("DeviceCode");
  const deviceCode = await adapter.findByUserCode(normalizedUserCode);

  if (!deviceCode) {
    return {
      ok: false,
      error: "invalid_grant",
      description: "Invalid, expired, or already used device code",
      status: 400,
    };
  }

  if (deviceCode.consumed) {
    return {
      ok: false,
      error: "invalid_grant",
      description: "Device code already used",
      status: 400,
    };
  }

  if (deviceCode.exp && deviceCode.exp < Math.floor(Date.now() / 1000)) {
    return {
      ok: false,
      error: "expired_token",
      description: "The device code has expired",
      status: 400,
    };
  }

  const boundClient =
    typeof deviceCode.clientId === "string"
      ? deviceCode.clientId
      : typeof deviceCode.params === "object" &&
          deviceCode.params !== null &&
          typeof (deviceCode.params as Record<string, unknown>).client_id === "string"
        ? ((deviceCode.params as Record<string, unknown>).client_id as string)
        : null;

  if (!boundClient || boundClient !== oidcClientId) {
    return {
      ok: false,
      error: "invalid_grant",
      description: "Device code does not match this client",
      status: 400,
    };
  }

  const provider = await getProvider();
  const grant = new provider.Grant();
  grant.clientId = oidcClientId;
  grant.accountId = accountId;
  const scope =
    typeof deviceCode.scope === "string"
      ? deviceCode.scope
      : typeof deviceCode.params === "object" &&
          deviceCode.params !== null &&
          typeof (deviceCode.params as Record<string, unknown>).scope === "string"
        ? ((deviceCode.params as Record<string, unknown>).scope as string)
        : "";
  if (scope) {
    grant.addOIDCScope(scope);
    grant.addResourceScope(getIssuer(), scope);
  }
  const grantId = await grant.save();
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = deviceCode.exp ? Math.max(deviceCode.exp - now, 1) : 600;

  const params =
    typeof deviceCode.params === "object" && deviceCode.params !== null
      ? (deviceCode.params as Record<string, unknown>)
      : null;
  const resourceFromParams = params?.resource;
  const resource =
    typeof resourceFromParams === "string" && resourceFromParams.length > 0
      ? resourceFromParams
      : typeof deviceCode.resource === "string" && deviceCode.resource.length > 0
        ? deviceCode.resource
        : getIssuer();

  await adapter.upsert(
    deviceCode.jti!,
    {
      ...deviceCode,
      accountId,
      grantId,
      scope,
      resource,
      authTime: now,
      acr: typeof deviceCode.acr === "string" ? deviceCode.acr : "urn:pmth:session",
      amr: Array.isArray(deviceCode.amr) ? deviceCode.amr : ["pwd"],
      error: undefined,
      errorDescription: undefined,
    },
    expiresIn,
  );

  return { ok: true };
}

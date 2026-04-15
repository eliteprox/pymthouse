/**
 * Device verification API — custom endpoint for the device verification UI.
 *
 * Since we use our own React UI for device code verification (instead of the
 * provider's built-in HTML forms), this endpoint wraps the provider's adapter
 * to look up, approve, or deny device codes.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { getProvider } from "@/lib/oidc/provider";
import { SqliteAdapter } from "@/lib/oidc/adapter";
import { getClient } from "@/lib/oidc/clients";
import { normalizeUserCode } from "@/lib/oidc/device";
import { getIssuer } from "@/lib/oidc/tokens";
import { resolveAppBrandingByClientId } from "@/lib/oidc/branding";
import { checkAppAccess } from "@/lib/oidc/app-access";

function errorResponse(
  error: string,
  description: string,
  status: number = 400,
): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse("unauthorized", "You must be signed in", 401);
  }
  const userId = (session.user as Record<string, unknown>).id as string;
  if (!userId) {
    return errorResponse("unauthorized", "You must be signed in", 401);
  }

  const body = await request.json();
  const userCode = body.user_code;
  const action = body.action; // "lookup" | "approve" | "deny"

  if (!userCode || !action) {
    return errorResponse("invalid_request", "user_code and action are required");
  }

  if (!["lookup", "approve", "deny"].includes(action)) {
    return errorResponse("invalid_request", "action must be lookup, approve, or deny");
  }

  // Look up the device code through the adapter
  const adapter = new SqliteAdapter("DeviceCode");
  const normalizedUserCode = normalizeUserCode(userCode);
  const deviceCode = await adapter.findByUserCode(normalizedUserCode);

  if (!deviceCode) {
    return errorResponse("invalid_grant", "Invalid, expired, or already used device code");
  }

  // Check if consumed/expired
  if (deviceCode.consumed) {
    return errorResponse("invalid_grant", "Device code already used");
  }

  if (deviceCode.exp && deviceCode.exp < Math.floor(Date.now() / 1000)) {
    return errorResponse("expired_token", "The device code has expired");
  }

  if (action === "lookup") {
    const clientId = deviceCode.clientId || deviceCode.params?.client_id;
    const client =
      typeof clientId === "string" ? await getClient(clientId) : null;
    const branding =
      typeof clientId === "string"
        ? await resolveAppBrandingByClientId(clientId)
        : null;
    const scope =
      typeof deviceCode.scope === "string"
        ? deviceCode.scope
        : typeof deviceCode.params?.scope === "string"
          ? deviceCode.params.scope
          : "";
    return NextResponse.json({
      client_name: client?.displayName || clientId || "Unknown Application",
      scopes: scope.split(" ").filter(Boolean),
      branding: branding ? {
        mode: branding.mode,
        displayName: branding.displayName,
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor,
      } : null,
    });
  }

  if (action === "approve") {
    const clientId = deviceCode.clientId || deviceCode.params?.client_id;
    if (typeof clientId !== "string" || !clientId) {
      return errorResponse("server_error", "Device code is missing client binding", 500);
    }

    // Check app access before approving
    const accessCheck = await checkAppAccess(clientId, userId);
    if (!accessCheck.allowed) {
      return errorResponse(
        "access_denied",
        accessCheck.reason || "You do not have access to this application",
        403
      );
    }

    const provider = await getProvider();
    const grant = new provider.Grant();
    grant.clientId = clientId;
    grant.accountId = userId;
    const scope =
      typeof deviceCode.scope === "string"
        ? deviceCode.scope
        : typeof deviceCode.params?.scope === "string"
          ? deviceCode.params.scope
          : "";
    if (scope) {
      grant.addOIDCScope(scope);
      grant.addResourceScope(getIssuer(), scope);
    }
    const grantId = await grant.save();
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = deviceCode.exp ? Math.max(deviceCode.exp - now, 1) : 600;

    // Resolve the resource indicator from the original device auth request
    // so the token exchange can issue audience-bound JWT access tokens.
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
        accountId: userId,
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

    return NextResponse.json({ status: "authorized" });
  }

  // action === "deny"
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = deviceCode.exp ? Math.max(deviceCode.exp - now, 1) : 600;
  await adapter.upsert(
    deviceCode.jti!,
    {
      ...deviceCode,
      error: "access_denied",
      errorDescription: "The user denied the authorization request",
    },
    expiresIn,
  );

  return NextResponse.json({ status: "denied" });
}

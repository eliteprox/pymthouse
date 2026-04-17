/**
 * POST /api/v1/apps/{clientId}/device/approve
 *
 * Completes the device authorization grant on behalf of an end user using * confidential client authentication (Basic auth). Requires the app to opt in
 * to third-party device login and a users:token or users:write scope.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { authenticateAppClient, hasScope } from "@/lib/auth";
import { getProviderApp } from "@/lib/provider-apps";
import { db } from "@/db/index";
import { endUsers, oidcClients, users } from "@/db/schema";
import { normalizeUserCode } from "@/lib/oidc/device";
import { approveDeviceCodeForAccount } from "@/lib/oidc/device-approval";
import { findOrCreateAppEndUser } from "@/lib/billing";
import { createCorrelationId, writeAuditLog } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: clientId } = await params;

  const auth = await authenticateAppClient(request);
  if (!auth || auth.clientId !== clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasScope(auth.scopes, "users:token") && !hasScope(auth.scopes, "users:write")) {
    return NextResponse.json(
      { error: "Forbidden", error_description: "Requires users:token or users:write" },
      { status: 403 },
    );
  }

  const clientRows = await db
    .select({
      deviceThirdPartyInitiateLogin: oidcClients.deviceThirdPartyInitiateLogin,
    })
    .from(oidcClients)
    .where(eq(oidcClients.clientId, clientId))
    .limit(1);
  const clientRow = clientRows[0];
  if (!clientRow || clientRow.deviceThirdPartyInitiateLogin !== 1) {
    return NextResponse.json(
      {
        error: "invalid_client",
        error_description:
          "Device third-party login is not enabled for this client",
      },
      { status: 403 },
    );
  }

  const app = await getProviderApp(clientId);
  if (!app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userCodeRaw = typeof body.user_code === "string" ? body.user_code.trim() : "";
  if (!userCodeRaw) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "user_code is required" },
      { status: 400 },
    );
  }

  const sub =
    typeof body.sub === "string" && body.sub.trim() ? body.sub.trim() : null;
  const externalUserId =
    typeof body.externalUserId === "string" && body.externalUserId.trim()
      ? body.externalUserId.trim()
      : null;

  if ((sub ? 1 : 0) + (externalUserId ? 1 : 0) !== 1) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Provide exactly one of sub or externalUserId",
      },
      { status: 400 },
    );
  }

  let accountId: string;
  if (sub) {
    const found = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, sub))
      .limit(1);
    if (found[0]) {
      accountId = found[0].id;
    } else {
      const endFound = await db
        .select({ id: endUsers.id })
        .from(endUsers)
        .where(eq(endUsers.id, sub))
        .limit(1);
      if (!endFound[0]) {
        return NextResponse.json(
          { error: "invalid_request", error_description: "Unknown sub" },
          { status: 400 },
        );
      }
      accountId = endFound[0].id;
    }
  } else {
    const { id } = await findOrCreateAppEndUser(app.id, externalUserId!);
    accountId = id;
  }

  const normalizedUserCode = normalizeUserCode(userCodeRaw);
  const result = await approveDeviceCodeForAccount(
    normalizedUserCode,
    clientId,
    accountId,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, error_description: result.description },
      { status: result.status },
    );
  }

  const correlationId = createCorrelationId();
  await writeAuditLog({
    clientId: app.id,
    actorUserId: null,
    action: "device_code_approved_builder",
    status: "success",
    correlationId,
    metadata: {
      oidcClientId: clientId,
      ...(externalUserId ? { externalUserId } : { sub }),
    },
  });

  return NextResponse.json({ status: "authorized" });
}

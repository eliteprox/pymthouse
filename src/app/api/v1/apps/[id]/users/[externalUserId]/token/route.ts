import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { authenticateAppClient, hasScope } from "@/lib/auth";
import { db } from "@/db/index";
import { appUsers } from "@/db/schema";
import { createCorrelationId, writeAuditLog } from "@/lib/audit";
import { issueProgrammaticTokens } from "@/lib/oidc/programmatic-tokens";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; externalUserId: string }> },
) {
  const { id, externalUserId } = await params;
  const correlationId = createCorrelationId();
  const client = await authenticateAppClient(request);

  if (!client) {
    return NextResponse.json(
      {
        error: "invalid_client",
        error_description: "failed confidential-client authentication",
        correlation_id: correlationId,
      },
      { status: 401 },
    );
  }

  if (client.appId !== id) {
    await writeAuditLog({
      clientId: id,
      action: "programmatic_token_issued",
      status: "forbidden",
      correlationId,
      metadata: { reason: "cross_app_request", callerAppId: client.appId },
    });
    return NextResponse.json(
      {
        error: "forbidden",
        error_description: "client_id does not match the requested app",
        correlation_id: correlationId,
      },
      { status: 403 },
    );
  }

  if (!hasScope(client.scopes, "users:token")) {
    return NextResponse.json(
      {
        error: "invalid_scope",
        error_description: "users:token scope is required for this client",
        correlation_id: correlationId,
      },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const requestedScopes = String(body.scope || "")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  const invalidScope = requestedScopes.find(
    (scope) => !hasScope(client.scopes, scope) || scope === "admin",
  );
  if (invalidScope) {
    await writeAuditLog({
      clientId: id,
      action: "programmatic_token_issued",
      status: "invalid_scope",
      correlationId,
      metadata: { invalidScope },
    });
    return NextResponse.json(
      {
        error: "invalid_scope",
        error_description: "requested scope is not allowed for this client",
        correlation_id: correlationId,
      },
      { status: 400 },
    );
  }

  const appUserRows = await db
    .select()
    .from(appUsers)
    .where(
      and(
        eq(appUsers.clientId, id),
        eq(appUsers.externalUserId, externalUserId),
      ),
    )
    .limit(1);
  const appUser = appUserRows[0];

  if (!appUser || appUser.status !== "active") {
    await writeAuditLog({
      clientId: id,
      action: "programmatic_token_issued",
      status: "not_found",
      correlationId,
      metadata: { externalUserId },
    });
    return NextResponse.json(
      {
        error: "not_found",
        error_description: "the provisioned user could not be resolved",
        correlation_id: correlationId,
      },
      { status: 404 },
    );
  }

  const scopes = requestedScopes.length > 0
    ? requestedScopes
    : ["sign:job", "discover:orchestrators"];

  const tokens = await issueProgrammaticTokens({
    appId: id,
    clientId: client.clientId,
    appUserId: appUser.id,
    scopes,
    role: "user",
  });

  await writeAuditLog({
    clientId: id,
    action: "programmatic_token_issued",
    status: "success",
    correlationId,
    metadata: {
      externalUserId,
      scopes,
      clientId: client.clientId,
    },
  });

  return NextResponse.json({ ...tokens, correlation_id: correlationId });
}

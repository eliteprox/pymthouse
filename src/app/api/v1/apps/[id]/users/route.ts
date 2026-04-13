import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { authenticateAppClient, authenticateRequestAsync, hasScope } from "@/lib/auth";
import { db } from "@/db/index";
import { appUsers } from "@/db/schema";
import {
  canEditProviderApp,
  getAuthorizedProviderApp,
  appEditForbiddenResponse,
} from "@/lib/provider-apps";
import { createCorrelationId, writeAuditLog } from "@/lib/audit";

async function canAccessUsers(request: NextRequest, appId: string, requiredScope: string) {
  const providerAuth = await getAuthorizedProviderApp(appId);
  if (providerAuth) {
    return { app: providerAuth.app, actorUserId: providerAuth.userId, clientId: providerAuth.app.id };
  }

  const bearer = await authenticateRequestAsync(request);
  if (bearer?.appId === appId && hasScope(bearer.scopes, requiredScope)) {
    return { app: { id: appId }, actorUserId: bearer.userId, clientId: appId };
  }

  const clientAuth = await authenticateAppClient(request);
  if (clientAuth?.appId === appId) {
    const required = requiredScope === "users:read" ? "users:read" : "users:write";
    const allowed = hasScope(clientAuth.scopes, required);
    if (allowed) {
      return { app: { id: appId }, actorUserId: null, clientId: appId };
    }
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await canAccessUsers(request, id, "users:read");
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const users = await db.select().from(appUsers).where(eq(appUsers.clientId, id));
  return NextResponse.json({ users });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const providerAuth = await getAuthorizedProviderApp(id);
  if (providerAuth && !(await canEditProviderApp(providerAuth))) {
    return appEditForbiddenResponse();
  }

  const access = await canAccessUsers(request, id, "users:write");
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const externalUserId = String(body.externalUserId || "").trim();
  const email = typeof body.email === "string" ? body.email.trim() : null;
  if (!externalUserId) {
    return NextResponse.json({ error: "externalUserId is required" }, { status: 400 });
  }

  const existingRows = await db
    .select()
    .from(appUsers)
    .where(
      and(
        eq(appUsers.clientId, id),
        eq(appUsers.externalUserId, externalUserId),
      ),
    )
    .limit(1);
  const existing = existingRows[0];

  if (existing) {
    await db
      .update(appUsers)
      .set({
        email,
        status: typeof body.status === "string" ? body.status : existing.status,
        role: "user",
      })
      .where(eq(appUsers.id, existing.id));

    return NextResponse.json({
      ...existing,
      email,
      status: typeof body.status === "string" ? body.status : existing.status,
      role: "user",
    });
  }

  const user = {
    id: uuidv4(),
    clientId: id,
    externalUserId,
    email,
    status: typeof body.status === "string" ? body.status : "active",
    role: "user",
    createdAt: new Date().toISOString(),
  };

  await db.insert(appUsers).values(user);

  await writeAuditLog({
    clientId: id,
    actorUserId: access.actorUserId,
    action: "app_user_upserted",
    status: "success",
    metadata: { externalUserId },
  });

  return NextResponse.json(user, { status: 201 });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const providerAuthPut = await getAuthorizedProviderApp(id);
  if (providerAuthPut && !(await canEditProviderApp(providerAuthPut))) {
    return appEditForbiddenResponse();
  }

  const access = await canAccessUsers(request, id, "users:write");
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const externalUserId = String(body.externalUserId || "").trim();
  if (!externalUserId) {
    return NextResponse.json({ error: "externalUserId is required" }, { status: 400 });
  }

  const existingPutRows = await db
    .select()
    .from(appUsers)
    .where(
      and(
        eq(appUsers.clientId, id),
        eq(appUsers.externalUserId, externalUserId),
      ),
    )
    .limit(1);
  const existing = existingPutRows[0];

  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await db
    .update(appUsers)
    .set({
      email: typeof body.email === "string" ? body.email.trim() : existing.email,
      status: typeof body.status === "string" ? body.status : existing.status,
      role: "user",
    })
    .where(eq(appUsers.id, existing.id));

  await writeAuditLog({
    clientId: id,
    actorUserId: access.actorUserId,
    action: "app_user_updated",
    status: "success",
    metadata: { externalUserId },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const providerAuthDel = await getAuthorizedProviderApp(id);
  if (providerAuthDel && !(await canEditProviderApp(providerAuthDel))) {
    return appEditForbiddenResponse();
  }

  const access = await canAccessUsers(request, id, "users:write");
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const externalUserId = searchParams.get("externalUserId");
  if (!externalUserId) {
    return NextResponse.json({ error: "externalUserId is required" }, { status: 400 });
  }

  const existingDelRows = await db
    .select()
    .from(appUsers)
    .where(
      and(
        eq(appUsers.clientId, id),
        eq(appUsers.externalUserId, externalUserId),
      ),
    )
    .limit(1);
  const existing = existingDelRows[0];

  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await db.update(appUsers).set({ status: "inactive" }).where(eq(appUsers.id, existing.id));

  const correlationId = createCorrelationId();
  await writeAuditLog({
    clientId: id,
    actorUserId: access.actorUserId,
    action: "app_user_deactivated",
    status: "success",
    correlationId,
    metadata: { externalUserId },
  });

  return NextResponse.json({ success: true, correlation_id: correlationId });
}

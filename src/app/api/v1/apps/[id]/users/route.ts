import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { authenticateAppClient, authenticateRequestAsync, hasScope } from "@/lib/auth";
import { db } from "@/db/index";
import { appUsers } from "@/db/schema";
import {
  canEditProviderApp,
  getProviderApp,
  getAuthorizedProviderApp,
  appEditForbiddenResponse,
} from "@/lib/provider-apps";
import { createCorrelationId, writeAuditLog } from "@/lib/audit";

async function canAccessUsers(request: NextRequest, clientId: string, requiredScope: string) {
  const app = await getProviderApp(clientId);
  if (!app) {
    return null;
  }

  const providerAuth = await getAuthorizedProviderApp(clientId);
  if (providerAuth) {
    return { app: providerAuth.app, actorUserId: providerAuth.userId, clientId: providerAuth.app.id };
  }

  const bearer = await authenticateRequestAsync(request);
  if (bearer?.appId === clientId && hasScope(bearer.scopes, requiredScope)) {
    return { app, actorUserId: bearer.userId, clientId: app.id };
  }

  const clientAuth = await authenticateAppClient(request);
  if (clientAuth?.appId === clientId) {
    const required = requiredScope === "users:read" ? "users:read" : "users:write";
    const allowed = hasScope(clientAuth.scopes, required);
    if (allowed) {
      return { app, actorUserId: null, clientId: app.id };
    }
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const access = await canAccessUsers(request, clientId, "users:read");
  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await db.select().from(appUsers).where(eq(appUsers.clientId, access.app.id));
  return NextResponse.json({
    users: users.map((user) => ({
      ...user,
      clientId,
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const providerAuth = await getAuthorizedProviderApp(clientId);
  if (providerAuth && !(await canEditProviderApp(providerAuth))) {
    return appEditForbiddenResponse();
  }

  const access = await canAccessUsers(request, clientId, "users:write");
  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        eq(appUsers.clientId, access.app.id),
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
      clientId,
      email,
      status: typeof body.status === "string" ? body.status : existing.status,
      role: "user",
    });
  }

  const user = {
    id: uuidv4(),
    clientId: access.app.id,
    externalUserId,
    email,
    status: typeof body.status === "string" ? body.status : "active",
    role: "user",
    createdAt: new Date().toISOString(),
  };

  await db.insert(appUsers).values(user);

  await writeAuditLog({
    clientId: access.app.id,
    actorUserId: access.actorUserId,
    action: "app_user_upserted",
    status: "success",
    metadata: { externalUserId },
  });

  return NextResponse.json(
    {
      ...user,
      clientId,
    },
    { status: 201 },
  );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const providerAuthPut = await getAuthorizedProviderApp(clientId);
  if (providerAuthPut && !(await canEditProviderApp(providerAuthPut))) {
    return appEditForbiddenResponse();
  }

  const access = await canAccessUsers(request, clientId, "users:write");
  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        eq(appUsers.clientId, access.app.id),
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
    clientId: access.app.id,
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
  const { id: clientId } = await params;
  const providerAuthDel = await getAuthorizedProviderApp(clientId);
  if (providerAuthDel && !(await canEditProviderApp(providerAuthDel))) {
    return appEditForbiddenResponse();
  }

  const access = await canAccessUsers(request, clientId, "users:write");
  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        eq(appUsers.clientId, access.app.id),
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
    clientId: access.app.id,
    actorUserId: access.actorUserId,
    action: "app_user_deactivated",
    status: "success",
    correlationId,
    metadata: { externalUserId },
  });

  return NextResponse.json({ success: true, correlation_id: correlationId });
}

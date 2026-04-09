import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { apiKeys, subscriptions } from "@/db/schema";
import { hashToken } from "@/lib/auth";
import { generateApiKeyValue } from "@/lib/oidc/programmatic-tokens";
import { getAuthorizedProviderApp } from "@/lib/provider-apps";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getAuthorizedProviderApp(id);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const keys = await db.select().from(apiKeys).where(eq(apiKeys.clientId, id));
  return NextResponse.json({ keys });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getAuthorizedProviderApp(id);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  const userId = (session?.user as Record<string, unknown> | undefined)?.id as string | undefined;
  const body = await request.json().catch(() => ({}));

  const subscriptionId = typeof body.subscriptionId === "string" ? body.subscriptionId : null;
  if (subscriptionId) {
    const subRows = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.id, subscriptionId),
          eq(subscriptions.clientId, id),
        ),
      )
      .limit(1);
    const subscription = subRows[0];
    if (!subscription) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }
  }

  const apiKeyValue = generateApiKeyValue();
  const apiKey = {
    id: uuidv4(),
    keyHash: hashToken(apiKeyValue),
    userId: userId || null,
    clientId: id,
    subscriptionId,
    label: typeof body.label === "string" ? body.label : null,
    status: "active",
    createdAt: new Date().toISOString(),
    revokedAt: null,
  };

  await db.insert(apiKeys).values(apiKey);

  return NextResponse.json(
    {
      apiKey: apiKeyValue,
      id: apiKey.id,
      message: "Store this API key securely. It will not be shown again.",
    },
    { status: 201 },
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getAuthorizedProviderApp(id);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const keyId = searchParams.get("keyId");
  if (!keyId) {
    return NextResponse.json({ error: "keyId is required" }, { status: 400 });
  }

  await db
    .update(apiKeys)
    .set({
      status: "revoked",
      revokedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(apiKeys.id, keyId),
        eq(apiKeys.clientId, id),
      ),
    );

  return NextResponse.json({ success: true });
}

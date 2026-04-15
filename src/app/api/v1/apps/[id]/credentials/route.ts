import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps, oidcClients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rotateClientSecret } from "@/lib/oidc/clients";
import {
  canEditProviderApp,
  getAuthorizedProviderApp,
  appEditForbiddenResponse,
} from "@/lib/provider-apps";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await getAuthorizedProviderApp(clientId);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await canEditProviderApp(auth))) {
    return appEditForbiddenResponse();
  }

  const { app } = auth;

  if (!app.oidcClientId) {
    return NextResponse.json(
      { error: "App has no OIDC client configured" },
      { status: 400 }
    );
  }

  const clientRows = await db
    .select()
    .from(oidcClients)
    .where(eq(oidcClients.id, app.oidcClientId))
    .limit(1);
  const client = clientRows[0];

  if (!client) {
    return NextResponse.json(
      { error: "OIDC client not found" },
      { status: 500 }
    );
  }

  const secret = await rotateClientSecret(client.clientId);
  if (!secret) {
    return NextResponse.json(
      { error: "Failed to generate secret" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    clientId: client.clientId,
    clientSecret: secret,
    message: "Store this secret securely. It will not be shown again.",
  });
}

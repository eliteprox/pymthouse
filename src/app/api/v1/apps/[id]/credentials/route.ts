import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps, oidcClients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rotateClientSecret } from "@/lib/oidc/clients";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as Record<string, unknown>).id as string;
  const role = (session.user as Record<string, unknown>).role as string;

  const app = db
    .select()
    .from(developerApps)
    .where(eq(developerApps.id, id))
    .get();

  if (!app || (app.ownerId !== userId && role !== "admin")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!app.oidcClientId) {
    return NextResponse.json(
      { error: "App has no OIDC client configured" },
      { status: 400 }
    );
  }

  const client = db
    .select()
    .from(oidcClients)
    .where(eq(oidcClients.id, app.oidcClientId))
    .get();

  if (!client) {
    return NextResponse.json(
      { error: "OIDC client not found" },
      { status: 500 }
    );
  }

  const secret = rotateClientSecret(client.clientId);
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
